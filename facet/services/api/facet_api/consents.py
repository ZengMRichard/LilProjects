"""Consent types (spec section 8): separate, unbundled and individually revocable."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from facet_api.db import Consent, User
from facet_api.schemas import ConsentState

CONSENTS: dict[str, dict] = {
    "biometric_processing": {
        "title": "Biometric processing",
        "version": "2026-11-01",
        "required": True,
        "available": True,
    },
    "research_use": {
        "title": "Research use",
        "version": "2026-11-01",
        "required": False,
        "available": True,
    },
    "analyst_review": {
        "title": "Analyst review",
        "version": "2026-11-01",
        "required": False,
        "available": False,  # the analyst console ships in v2
    },
}


def active_consent(db: Session, user_id: str, consent_type: str) -> Consent | None:
    return db.scalar(
        select(Consent)
        .where(Consent.user_id == user_id, Consent.type == consent_type, Consent.revoked_at.is_(None))
        .order_by(Consent.granted_at.desc())
    )


def consent_states(db: Session, user: User) -> list[ConsentState]:
    out = []
    for consent_type, spec in CONSENTS.items():
        latest = db.scalar(
            select(Consent)
            .where(Consent.user_id == user.id, Consent.type == consent_type)
            .order_by(Consent.granted_at.desc())
        )
        granted = latest is not None and latest.revoked_at is None and latest.version == spec["version"]
        out.append(
            ConsentState(
                type=consent_type,  # type: ignore[arg-type]
                title=spec["title"],
                required=spec["required"],
                available=spec["available"],
                version=spec["version"],
                granted=granted,
                granted_at=latest.granted_at if latest else None,
                revoked_at=latest.revoked_at if latest else None,
            )
        )
    return out
