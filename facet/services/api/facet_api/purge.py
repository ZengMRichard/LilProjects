"""Scheduled deletion (spec section 8): no image object may outlive its purge_at."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from facet_api.db import Report, ScanImage, User, audit, now
from facet_api.storage import Storage


def delete_scan_objects(db: Session, storage: Storage, scan, *, actor: str, user_id: str | None) -> int:
    """Delete a scan's stored images and its cached PDF (which embeds the photo)."""
    from facet_worker.pipeline import delete_image

    removed = sum(1 for image in scan.images if delete_image(db, storage, image, actor=actor, user_id=user_id))
    report: Report | None = scan.report
    if report is not None and report.pdf_key:
        storage.delete(report.pdf_key)
        audit(db, user_id=user_id, actor=actor, action="pdf.delete", target=report.id)
        report.pdf_key = None
    return removed


def purge_expired(db: Session, storage: Storage) -> int:
    """Delete every stored image whose purge_at has passed. Returns how many were removed."""
    due = db.scalars(select(ScanImage).where(ScanImage.storage_key.is_not(None), ScanImage.purge_at <= now())).all()
    scans = {image.scan_id: image.scan for image in due}
    removed = 0
    for scan in scans.values():
        removed += delete_scan_objects(db, storage, scan, actor="purge-job", user_id=scan.user_id)
    db.commit()
    return removed


def overdue_images(db: Session, grace: timedelta = timedelta(minutes=30)) -> int:
    """Images still stored past purge_at plus a grace period. Must be zero; health reports it."""
    return int(
        db.scalar(
            select(func.count())
            .select_from(ScanImage)
            .where(ScanImage.storage_key.is_not(None), ScanImage.purge_at <= now() - grace)
        )
        or 0
    )


def delete_account(db: Session, storage: Storage, user: User) -> None:
    """Delete the account and everything derived from it. The audit trail keeps only the id."""
    from facet_api.db import AuthSession, Scan

    for scan in db.scalars(select(Scan).where(Scan.user_id == user.id)).all():
        delete_scan_objects(db, storage, scan, actor=f"user:{user.id}", user_id=user.id)
        db.delete(scan)
    for session in db.scalars(select(AuthSession).where(AuthSession.user_id == user.id)).all():
        db.delete(session)
    audit(db, user_id=user.id, actor=f"user:{user.id}", action="account.delete", target=user.id)
    db.delete(user)
    db.commit()
