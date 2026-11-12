"""Reports, PDF, checkout, progress and the routine plan."""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from facet_api.config import Settings
from facet_api.db import PlanItem, Purchase, Report, Scan, User, audit, aware, now
from facet_api.deps import current_user, get_db, get_settings, get_storage, optional_user
from facet_api.report_view import PREVIEW_PLAN_ITEMS, build_report, plan_item_out
from facet_api.schemas import (
    CheckoutRequest,
    CheckoutResult,
    PlanItemOut,
    PlanOut,
    PlanPatch,
    ProgressMetric,
    ProgressOut,
    ProgressPoint,
    ReportOut,
    ReportSummary,
    SignedUrl,
)
from facet_api.security import sign, verify
from facet_api.storage import Storage
from facet_metrics.registry import BY_KEY
from facet_norms import load_norms
from facet_templates.metric_copy import COPY, format_value
from facet_templates.plan import PLAN_PREFACE
from facet_worker.pdf import PdfUnavailable, render_pdf

router = APIRouter(prefix="/v1")
RENDER_TTL = 180
PDF_URL_TTL = 300
PROGRESS_NOTE = (
    "A change smaller than the measurement noise of the two scans is marked as within noise. "
    "Head angle, expression and lighting move these numbers more than real change usually does."
)


def summary_of(report: Report) -> ReportSummary:
    return ReportSummary(
        id=report.id,
        scan_id=report.scan_id,
        tier=report.tier,
        source=report.scan.source,
        created_at=aware(report.created_at) or now(),
    )


def accessible_report(
    db: Session, report_id: str, request: Request, user: User | None, settings: Settings
) -> tuple[Report, User]:
    """The report, for its owner or for the PDF renderer holding a render token for it."""
    report = db.get(Report, report_id)
    if report is not None:
        owner = db.get(User, report.scan.user_id)
        if owner is not None and user is not None and owner.id == user.id:
            return report, owner
        token = request.query_params.get("render_token")
        payload = verify(settings.secret, token, "render") if token else None
        if owner is not None and payload is not None and payload["s"] == report.id:
            return report, owner
    raise HTTPException(404, "Report not found.")


def owned_report(db: Session, report_id: str, user: User) -> Report:
    report = db.get(Report, report_id)
    if report is None or report.scan.user_id != user.id:
        raise HTTPException(404, "Report not found.")
    return report


@router.get("/reports", response_model=list[ReportSummary])
def list_reports(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[ReportSummary]:
    reports = db.scalars(
        select(Report).join(Scan).where(Scan.user_id == user.id).order_by(Report.created_at.desc()).limit(50)
    ).all()
    return [summary_of(report) for report in reports]


@router.get("/reports/{report_id}", response_model=ReportOut)
def get_report(
    report_id: str,
    request: Request,
    user: User | None = Depends(optional_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ReportOut:
    report, owner = accessible_report(db, report_id, request, user, settings)
    return build_report(db, report, owner, settings)


@router.get("/reports/{report_id}/pdf", response_model=SignedUrl)
def report_pdf(
    report_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
) -> SignedUrl:
    """A short-lived signed URL to the PDF, rendered on first request by headless Chromium."""
    report = owned_report(db, report_id, user)
    if report.tier == "free_preview":
        raise HTTPException(403, "The PDF comes with the full report.")
    if not report.pdf_key or not storage.exists(report.pdf_key):
        token = sign(settings.secret, "render", report.id, RENDER_TTL)
        url = f"{settings.web_url}/report/{report.id}/print?render_token={token}"
        try:
            pdf = render_pdf(url, settings.chrome_path)
        except PdfUnavailable as error:
            raise HTTPException(503, f"{error} Use your browser's Print, then Save as PDF, instead.") from error
        key = f"reports/{report.id}.pdf"
        storage.put(key, pdf)
        report.pdf_key = key
        audit(db, user_id=user.id, actor=f"user:{user.id}", action="pdf.render", target=report.id)
        db.commit()
    token = sign(
        settings.secret, "object", report.pdf_key, PDF_URL_TTL,
        u=user.id, a=f"user:{user.id}", t="application/pdf", f=f"facet-report-{report.id}.pdf",
    )  # fmt: skip
    return SignedUrl(url=f"/v1/objects/{token}", expires_at=datetime.now(UTC) + timedelta(seconds=PDF_URL_TTL))


@router.post("/reports/{report_id}/review", status_code=501)
def request_review(report_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    owned_report(db, report_id, user)
    raise HTTPException(501, "Analyst review arrives in v2, once the core metrics pass their accuracy gates.")


@router.post("/billing/checkout", response_model=CheckoutResult)
def checkout(
    body: CheckoutRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
) -> CheckoutResult:
    """Unlock the full report. Development uses a test provider that takes no payment."""
    report = owned_report(db, body.report_id, user)
    if not settings.dev:
        raise HTTPException(
            501, "No payment provider is configured. Stripe, StoreKit and Play Billing are not wired up yet."
        )
    if report.tier == "free_preview":
        report.tier = "full"
        if report.pdf_key:
            storage.delete(report.pdf_key)
            report.pdf_key = None
        db.add(Purchase(user_id=user.id, report_id=report.id, product=body.product, provider="dev", amount_usd=0))
        db.commit()
    return CheckoutResult(status="paid", provider="dev", tier=report.tier, amount_usd=0)


@router.get("/progress", response_model=ProgressOut)
def progress(user: User = Depends(current_user), db: Session = Depends(get_db)) -> ProgressOut:
    """Metric deltas across the user's scans, taken under the same capture protocol."""
    scans = db.scalars(
        select(Scan).where(Scan.user_id == user.id, Scan.status == "complete").order_by(Scan.completed_at)
    ).all()
    if not scans:
        return ProgressOut(source=None, scans=[], metrics=[], note=PROGRESS_NOTE)
    source = scans[-1].source
    scans = [scan for scan in scans if scan.source == source and scan.report is not None]
    group = load_norms().group(None)
    metrics: list[ProgressMetric] = []
    keys = [*BY_KEY, "symmetry.overall"]
    for key in keys:
        spec = BY_KEY.get(key)
        copy = COPY[key]
        unit = spec.unit if spec else "index"
        points = []
        for scan in scans:
            row = next((m for m in scan.metrics if m.metric_key == key), None)
            if row is None:
                continue
            points.append(
                ProgressPoint(
                    scan_id=scan.id,
                    report_id=scan.report.id if scan.report else None,
                    at=aware(scan.completed_at) or now(),
                    value=row.value,
                    display=format_value(row.value, unit, copy.signed),
                    ci_low=row.ci_low,
                    ci_high=row.ci_high,
                )
            )
        if len(points) < 2:
            continue
        first, last = points[0], points[-1]
        delta = last.value - first.value
        within = None
        if None not in (first.ci_low, first.ci_high, last.ci_low, last.ci_high):
            noise = math.hypot((first.ci_high - first.ci_low) / 2, (last.ci_high - last.ci_low) / 2)  # type: ignore[operator]
            within = abs(delta) <= noise
        entry = group.metrics.get(key) if spec is not None and not spec.experimental else None
        metrics.append(
            ProgressMetric(
                key=key,
                title=copy.title,
                region=spec.region if spec else "symmetry",
                unit=unit,
                points=points,
                delta=delta,
                delta_display=format_value(delta, unit, True)
                if unit in ("deg", "ipd")
                else f"{delta:+.3f}"
                if unit == "index"
                else f"{delta * 100:+.1f} pts"
                if unit == "share"
                else f"{delta:+.2f}",
                within_noise=within,
                reference_low=entry.low if entry else None,
                reference_high=entry.high if entry else None,
            )
        )
    return ProgressOut(
        source=source,  # type: ignore[arg-type]
        scans=[summary_of(scan.report) for scan in scans if scan.report],
        metrics=metrics,
        note=PROGRESS_NOTE,
    )


@router.get("/plan", response_model=PlanOut)
def get_plan(user: User = Depends(current_user), db: Session = Depends(get_db)) -> PlanOut:
    """The routine plan from the user's most recent report."""
    report = db.scalar(
        select(Report)
        .join(Scan)
        .where(Scan.user_id == user.id, Scan.status == "complete")
        .order_by(Report.created_at.desc())
    )
    if report is None:
        return PlanOut(report_id=None, preface=PLAN_PREFACE, items=[])
    items = [plan_item_out(item) for item in report.plan_items]
    shown = items if report.tier != "free_preview" else items[:PREVIEW_PLAN_ITEMS]
    return PlanOut(report_id=report.id, preface=PLAN_PREFACE, items=shown, locked_count=len(items) - len(shown))


@router.patch("/plan/{item_id}", response_model=PlanItemOut)
def update_plan_item(
    item_id: str, body: PlanPatch, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> PlanItemOut:
    item = db.get(PlanItem, item_id)
    if item is None or item.user_id != user.id:
        raise HTTPException(404, "Plan item not found.")
    item.status = body.status
    item.updated_at = now()
    db.commit()
    return plan_item_out(item)
