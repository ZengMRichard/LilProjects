"""Sign-in, the account, the age gate, consents, export and deletion."""

from __future__ import annotations

import io
import json
import re
import zipfile
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from facet_api.config import Settings
from facet_api.consents import CONSENTS, active_consent, consent_states
from facet_api.db import (
    AuditLog,
    AuthSession,
    Consent,
    MagicLink,
    PlanItem,
    Purchase,
    Scan,
    User,
    audit,
    aware,
    now,
)
from facet_api.deps import SESSION_COOKIE, current_user, get_db, get_settings, get_storage
from facet_api.purge import delete_account, delete_scan_objects
from facet_api.report_view import upsells_paused
from facet_api.schemas import (
    AgeRequest,
    AuditEntry,
    ConsentRequest,
    ConsentState,
    MagicLinkRequest,
    MagicLinkResponse,
    Me,
    SessionRequest,
)
from facet_api.security import hash_token, new_token
from facet_api.storage import Storage

router = APIRouter(prefix="/v1")
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAGIC_LINK_MINUTES = 15
ADULT_AGE = 18


def next_scan_at(db: Session, user: User, settings: Settings):
    if settings.scan_min_interval_days <= 0:
        return None
    last = db.scalar(
        select(Scan.completed_at)
        .where(Scan.user_id == user.id, Scan.status == "complete", Scan.source == "camera")
        .order_by(Scan.completed_at.desc())
    )
    if last is None:
        return None
    due = (aware(last) or now()) + timedelta(days=settings.scan_min_interval_days)
    return due if due > now() else None


def me_out(db: Session, user: User, settings: Settings) -> Me:
    consents = consent_states(db, user)
    biometric = next(c for c in consents if c.type == "biometric_processing")
    wait = next_scan_at(db, user, settings)
    return Me(
        id=user.id,
        email=user.email,
        age_verified=user.birth_year_verified,
        age_blocked=user.age_blocked,
        region=user.region,
        consents=consents,
        can_scan=user.birth_year_verified and not user.age_blocked and biometric.granted and wait is None,
        next_scan_at=wait,
        upsells_paused=upsells_paused(user, settings),
        env=settings.env,
        scan_min_interval_days=settings.scan_min_interval_days,
        image_retention_days=settings.image_retention_days,
    )


@router.post("/auth/magic-link", response_model=MagicLinkResponse)
def request_magic_link(
    body: MagicLinkRequest, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)
) -> MagicLinkResponse:
    email = body.email.strip().lower()
    if not EMAIL.match(email):
        raise HTTPException(422, "Enter a valid email address.")
    if not settings.dev:
        raise HTTPException(503, "Email delivery is not configured for this deployment.")
    token = new_token()
    db.add(
        MagicLink(token_hash=hash_token(token), email=email, expires_at=now() + timedelta(minutes=MAGIC_LINK_MINUTES))
    )
    db.commit()
    # Development has no mail server: the link's token is handed straight back to the browser.
    return MagicLinkResponse(sent=True, dev_token=token)


@router.post("/auth/session", response_model=Me)
def create_session(
    body: SessionRequest,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Me:
    link = db.get(MagicLink, hash_token(body.token))
    if link is None or link.used_at is not None or (aware(link.expires_at) or now()) < now():
        raise HTTPException(401, "This sign-in link has expired or was already used.")
    link.used_at = now()
    user = db.scalar(select(User).where(User.email == link.email))
    if user is None:
        user = User(email=link.email)
        db.add(user)
        db.flush()
    token = new_token()
    db.add(
        AuthSession(
            token_hash=hash_token(token), user_id=user.id, expires_at=now() + timedelta(days=settings.session_days)
        )
    )
    db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_days * 86400,
        httponly=True,
        samesite="lax",
        secure=not settings.dev,
        path="/",
    )
    return me_out(db, user, settings)


@router.delete("/auth/session", status_code=204)
def end_session(request: Request, response: Response, db: Session = Depends(get_db)) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        session = db.get(AuthSession, hash_token(token))
        if session is not None:
            db.delete(session)
            db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me", response_model=Me)
def get_me(
    user: User = Depends(current_user), db: Session = Depends(get_db), settings: Settings = Depends(get_settings)
) -> Me:
    return me_out(db, user, settings)


@router.post("/me/age", response_model=Me)
def attest_age(
    body: AgeRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Me:
    """18+ attestation. Only the outcome is stored, never the date of birth."""
    today = date.today()
    born = body.birth_date
    if born > today or born.year < 1900:
        raise HTTPException(422, "Enter a valid date of birth.")
    age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    user.birth_year_verified = age >= ADULT_AGE
    user.age_blocked = age < ADULT_AGE
    db.commit()
    return me_out(db, user, settings)


@router.get("/consents", response_model=list[ConsentState])
def list_consents(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[ConsentState]:
    return consent_states(db, user)


@router.post("/consents", response_model=list[ConsentState])
def grant_consent(
    body: ConsentRequest, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> list[ConsentState]:
    spec = CONSENTS[body.type]
    if not spec["available"]:
        raise HTTPException(409, f"{spec['title']} is not available yet, so there is nothing to consent to.")
    if body.version != spec["version"]:
        raise HTTPException(409, "The consent text has changed. Reload and read the current version.")
    if user.age_blocked or not user.birth_year_verified:
        raise HTTPException(403, "Confirm that you are 18 or older first.")
    if active_consent(db, user.id, body.type) is None:
        db.add(Consent(user_id=user.id, type=body.type, version=body.version))
        audit(db, user_id=user.id, actor=f"user:{user.id}", action="consent.grant", target=body.type)
        db.commit()
    return consent_states(db, user)


@router.delete("/consents/{consent_type}", response_model=list[ConsentState])
def revoke_consent(
    consent_type: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> list[ConsentState]:
    if consent_type not in CONSENTS:
        raise HTTPException(404, "Unknown consent type.")
    consent = active_consent(db, user.id, consent_type)
    if consent is not None:
        consent.revoked_at = now()
        audit(db, user_id=user.id, actor=f"user:{user.id}", action="consent.revoke", target=consent_type)
        if consent_type == "biometric_processing":
            # Withdrawing biometric consent deletes the stored images and landmarks at once.
            for scan in db.scalars(select(Scan).where(Scan.user_id == user.id)).all():
                delete_scan_objects(db, storage, scan, actor=f"user:{user.id}", user_id=user.id)
                for image in scan.images:
                    if image.landmarks is not None:
                        db.delete(image.landmarks)
                        audit(
                            db,
                            user_id=user.id,
                            actor=f"user:{user.id}",
                            action="landmarks.delete",
                            target=f"{scan.id}/{image.view}",
                        )
        db.commit()
    return consent_states(db, user)


@router.get("/me/audit", response_model=list[AuditEntry])
def my_audit(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[AuditEntry]:
    rows = db.scalars(select(AuditLog).where(AuditLog.user_id == user.id).order_by(AuditLog.at.desc()).limit(200)).all()
    return [AuditEntry(actor=r.actor, action=r.action, target=r.target, at=aware(r.at) or now()) for r in rows]


@router.get("/me/export")
def export_me(
    user: User = Depends(current_user), db: Session = Depends(get_db), storage: Storage = Depends(get_storage)
) -> Response:
    """Data-subject export (GDPR/CCPA): everything held about the account, as a zip."""
    scans = db.scalars(select(Scan).where(Scan.user_id == user.id).order_by(Scan.created_at)).all()
    document = {
        "exported_at": now().isoformat(),
        "user": {
            "id": user.id,
            "email": user.email,
            "age_verified": user.birth_year_verified,
            "region": user.region,
            "created_at": (aware(user.created_at) or now()).isoformat(),
        },
        "consents": [
            {
                "type": c.type,
                "version": c.version,
                "granted_at": (aware(c.granted_at) or now()).isoformat(),
                "revoked_at": aware(c.revoked_at).isoformat() if c.revoked_at else None,  # type: ignore[union-attr]
            }
            for c in db.scalars(select(Consent).where(Consent.user_id == user.id)).all()
        ],
        "scans": [
            {
                "id": s.id,
                "status": s.status,
                "source": s.source,
                "goals": s.goals,
                "age_range": s.age_range,
                "capture_protocol_version": s.capture_protocol_version,
                "created_at": (aware(s.created_at) or now()).isoformat(),
                "images": [
                    {
                        "view": i.view,
                        "stored": bool(i.storage_key),
                        "quality": i.quality_json,
                        "landmarks": i.landmarks.points if i.landmarks else None,
                        "landmark_model": i.landmarks.model_version if i.landmarks else None,
                    }
                    for i in s.images
                ],
                "metrics": [
                    {
                        "key": m.metric_key,
                        "value": m.value,
                        "ci_low": m.ci_low,
                        "ci_high": m.ci_high,
                        "reference_group": m.reference_group,
                        "band": m.percentile_band,
                        "metrics_lib_version": m.metrics_lib_version,
                    }
                    for m in s.metrics
                ],
                "report": {"id": s.report.id, "tier": s.report.tier, "narrative": s.report.narrative_json}
                if s.report
                else None,
            }
            for s in scans
        ],
        "plan_items": [
            {"action": p.action, "category": p.category, "evidence_level": p.evidence_level, "status": p.status}
            for p in db.scalars(select(PlanItem).where(PlanItem.user_id == user.id)).all()
        ],
        "purchases": [
            {"product": p.product, "provider": p.provider, "amount_usd": p.amount_usd, "report_id": p.report_id}
            for p in db.scalars(select(Purchase).where(Purchase.user_id == user.id)).all()
        ],
        "audit_log": [
            {"actor": a.actor, "action": a.action, "target": a.target, "at": (aware(a.at) or now()).isoformat()}
            for a in db.scalars(select(AuditLog).where(AuditLog.user_id == user.id).order_by(AuditLog.at)).all()
        ],
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("facet-export.json", json.dumps(document, indent=2))
        for scan in scans:
            for image in scan.images:
                if image.storage_key and storage.exists(image.storage_key):
                    archive.writestr(f"images/{scan.id}/{image.view}.jpg", storage.get(image.storage_key))
                    audit(
                        db,
                        user_id=user.id,
                        actor=f"user:{user.id}",
                        action="image.export",
                        target=f"{scan.id}/{image.view}",
                    )
    audit(db, user_id=user.id, actor=f"user:{user.id}", action="account.export", target=user.id)
    db.commit()
    return Response(
        buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="facet-export.zip"'},
    )


@router.delete("/me", status_code=204)
def delete_me(
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> None:
    delete_account(db, storage, user)
    response.delete_cookie(SESSION_COOKIE, path="/")
