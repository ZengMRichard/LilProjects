"""Assemble the report the viewer renders, from stored metric rows, landmarks and templates.

Tier filtering happens here: a free preview carries the face shape, three headline proportions,
the skin snapshot and the first plan items; everything else is listed as locked.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from facet_api.config import Settings
from facet_api.db import MetricResult, PlanItem, Report, User, aware, now
from facet_api.schemas import (
    FaceShapeOut,
    Figures,
    Geometry,
    ImageGeometry,
    MetricCard,
    Opener,
    PlanItemOut,
    PlanOut,
    Reference,
    ReferenceGroupOut,
    Region,
    ReportOut,
    SkinAttributeOut,
    SkinOut,
    SummaryOut,
    Support,
    SymmetryOut,
    SymmetryRegion,
    Unmeasured,
    Upsell,
)
from facet_metrics.canonical import SYMMETRY_REGIONS
from facet_metrics.registry import BY_KEY, METRICS
from facet_norms import NormEntry, band_side, load_norms, place
from facet_templates.metric_copy import (
    COPY,
    REGIONS,
    UNAVAILABLE_TITLES,
    format_value,
    landmark_labels,
)
from facet_templates.narrative import DISCLAIMER, OPENER, Finding, meaning, range_label, shape_text
from facet_templates.plan import CATEGORY_LABELS, PLAN_PREFACE
from facet_templates.wellbeing import SUPPORT

HEADLINE = ("face.thirds.middle_lower_ratio", "face.width_height_ratio", "eyes.spacing_ratio")
PREVIEW_PLAN_ITEMS = 3

SKIN_NOTE = (
    "Experimental. These bands come from simple image statistics, not a trained skin model. "
    "They shift with lighting and camera, and they have not been validated across skin tones."
)
SYMMETRY_NOTE = (
    "Brighter marks show where the left and right sides differ most. Mild asymmetry is normal: "
    "every face has it, and most of it is not noticeable to other people."
)
BORDERLINE_NOTE = " The interval crosses the edge of the range, so a repeat scan could land on either side."


def upsells_paused(user: User, settings: Settings) -> bool:
    flagged = aware(user.wellbeing_flag_at)
    return flagged is not None and (now() - flagged).days < settings.upsell_pause_days


def confidence_for(
    key: str, value: float, ci_low: float | None, ci_high: float | None, entry: NormEntry | None
) -> tuple[str, str]:
    spec = BY_KEY.get(key)
    if spec is not None and spec.experimental:
        return "low", "Experimental reading from the 3D mesh, not a validated measurement."
    if ci_low is None or ci_high is None:
        return "low", "Only one measurement was available, so the spread could not be estimated."
    half = (ci_high - ci_low) / 2
    if entry is not None:
        relative = half / (entry.high - entry.low)
        level = "high" if relative <= 0.10 else "medium" if relative <= 0.25 else "low"
        share = f"{relative * 100:.0f}%"
        return level, f"Repeat measurements on this frame varied by about {share} of the reference range."
    relative = half / max(abs(value), 1e-6)
    level = "high" if relative <= 0.02 else "medium" if relative <= 0.05 else "low"
    return level, f"Repeat measurements on this frame varied by about {relative * 100:.1f}% of the value."


def metric_card(row: MetricResult, entry: NormEntry | None, provisional: bool, group_label: str) -> MetricCard:
    key = row.metric_key
    copy = COPY[key]
    spec = BY_KEY.get(key)
    unit = spec.unit if spec else "index"
    region = spec.region if spec else "symmetry"
    reference = None
    side = None
    text = copy.unranged
    if entry is not None and (spec is None or not spec.experimental):
        placement = place(row.value, entry)
        side = band_side(placement.band)
        borderline = (
            row.ci_low is not None
            and row.ci_high is not None
            and (row.ci_low < entry.low < row.ci_high or row.ci_low < entry.high < row.ci_high)
        )
        finding = Finding(key, unit, row.value, side, entry.low, entry.high)
        text = meaning(finding) + (BORDERLINE_NOTE if borderline else "")
        reference = Reference(
            low=entry.low,
            high=entry.high,
            range_display=range_label(finding) or "",
            band=placement.band,
            side=side,  # type: ignore[arg-type]
            borderline=borderline,
            provisional=provisional,
            group_label=group_label,
        )
    level, reason = confidence_for(key, row.value, row.ci_low, row.ci_high, entry if reference else None)
    ci_display = None
    if row.ci_low is not None and row.ci_high is not None:
        ci_display = f"{format_value(row.ci_low, unit, copy.signed)} to {format_value(row.ci_high, unit, copy.signed)}"
    return MetricCard(
        key=key,
        region=region,
        title=copy.title,
        unit=unit,
        experimental=bool(spec and spec.experimental),
        value=row.value,
        display=format_value(row.value, unit, copy.signed),
        ci_low=row.ci_low,
        ci_high=row.ci_high,
        ci_display=ci_display,
        confidence=level,  # type: ignore[arg-type]
        confidence_reason=reason,
        reference=reference,
        what=copy.what,
        meaning=text,
        definition=spec.reference if spec else "1 - mean mirrored-pair deviation / IPD",
        landmarks=landmark_labels(spec.landmarks) if spec else ["all bilateral pairs"],
    )


def locked_card(key: str) -> MetricCard:
    spec = BY_KEY[key]
    return MetricCard(
        key=key, region=spec.region, title=COPY[key].title, unit=spec.unit, locked=True, experimental=spec.experimental
    )


def plan_item_out(item: PlanItem) -> PlanItemOut:
    return PlanItemOut(
        id=item.id,
        key=item.key,
        category=item.category,
        category_label=CATEGORY_LABELS.get(item.category, item.category),
        action=item.action,
        detail=item.detail,
        reason=item.reason,
        evidence_level=item.evidence_level,  # type: ignore[arg-type]
        evidence_note=item.evidence_note,
        status=item.status,  # type: ignore[arg-type]
    )


def build_report(db: Session, report: Report, user: User, settings: Settings) -> ReportOut:
    scan = report.scan
    narrative = report.narrative_json
    full = report.tier in ("full", "premium")
    norms = load_norms()
    group = norms.group(scan.reference_group)
    rows = {row.metric_key: row for row in scan.metrics}

    metrics: list[MetricCard] = []
    for spec in METRICS:
        row = rows.get(spec.key)
        if row is None:
            continue
        if full or spec.key in HEADLINE:
            metrics.append(metric_card(row, group.metrics.get(spec.key), norms.provisional, group.label))
        else:
            metrics.append(locked_card(spec.key))

    symmetry = None
    if full and "symmetry.overall" in rows:
        detail = narrative["symmetry"]
        labels = dict(SYMMETRY_REGIONS)
        symmetry = SymmetryOut(
            overall=metric_card(rows["symmetry.overall"], None, norms.provisional, group.label),
            regions=[
                SymmetryRegion(key=key, label=labels[key], index=index, mean_deviation_pct=round((1 - index) * 100, 2))
                for key, index in detail["regions"].items()
            ],
            pairs=[(p[0], p[1], p[2], p[3]) for p in detail["pairs"]],
            note=SYMMETRY_NOTE,
        )

    skin_raw = narrative["skin"]
    skin = SkinOut(
        status=skin_raw["status"],
        reason=skin_raw.get("reason"),
        note=SKIN_NOTE,
        attributes=[SkinAttributeOut(**a) for a in skin_raw["attributes"]],
    )

    items = [plan_item_out(item) for item in report.plan_items]
    shown = items if full else items[:PREVIEW_PLAN_ITEMS]
    plan = PlanOut(report_id=report.id, preface=PLAN_PREFACE, items=shown, locked_count=len(items) - len(shown))

    shape = narrative["face_shape"]
    geometry = narrative["geometry"]
    front_image = next((image for image in scan.images if image.view == "front"), None)
    paused = upsells_paused(user, settings)

    unavailable = [
        Unmeasured(key=u["key"], title=UNAVAILABLE_TITLES.get(u["key"]) or COPY[u["key"]].title, reason=u["reason"])
        for u in narrative.get("unavailable", [])
    ]

    return ReportOut(
        id=report.id,
        scan_id=scan.id,
        tier=report.tier,  # type: ignore[arg-type]
        source=scan.source,  # type: ignore[arg-type]
        created_at=aware(report.created_at) or now(),
        versions=narrative["versions"],
        reference_group=ReferenceGroupOut(
            key=group.key,
            label=group.label,
            description=group.description,
            provisional=norms.provisional,
            note=norms.note,
            source=group.source,
            sample=group.sample,
            era=group.era,
        ),
        opener=Opener(**OPENER),
        regions=[Region(key=key, label=label) for key, label in REGIONS],
        headline=list(HEADLINE),
        metrics=metrics,
        face_shape=FaceShapeOut(**shape, text=shape_text(shape["label"], shape["runner_up"])),
        figures=Figures(**narrative["figures"]),
        geometry=Geometry(
            frontal=[(p[0], p[1]) for p in geometry["frontal"]],
            image=ImageGeometry(
                width=geometry["image"]["width"],
                height=geometry["image"]["height"],
                points=[(p[0], p[1]) for p in geometry["image"]["points"]],
                available=bool(front_image and front_image.storage_key),
            ),
        ),
        symmetry=symmetry,
        skin=skin,
        summary=SummaryOut(**narrative["summary"]) if full else None,
        plan=plan,
        unavailable=unavailable,
        poses=narrative.get("poses", {}),
        support=Support(**SUPPORT) if paused else None,
        upsell=Upsell(
            paused=paused, price_usd=settings.full_report_price_usd, provider="dev" if settings.dev else "none"
        ),
        disclaimer=DISCLAIMER,
    )
