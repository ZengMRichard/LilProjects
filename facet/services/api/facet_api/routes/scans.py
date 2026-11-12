"""Scans: create, upload through signed URLs, submit, poll, and image access."""

from __future__ import annotations

import io
import math
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from facet_api import CAPTURE_PROTOCOL_VERSION
from facet_api.config import Settings
from facet_api.consents import CONSENTS, active_consent
from facet_api.db import LandmarkSet, Report, Scan, ScanImage, User, audit, aware, now
from facet_api.deps import (
    current_user,
    get_db,
    get_settings,
    get_storage,
    image_rate_limit,
    optional_user,
)
from facet_api.purge import delete_scan_objects
from facet_api.routes.auth import next_scan_at
from facet_api.schemas import ImageState, ScanCreate, ScanCreated, ScanOut, ScanSubmit, SignedUrl, Support
from facet_api.security import sign, verify
from facet_api.storage import Storage
from facet_templates.wellbeing import SUPPORT, screen_text
from facet_worker import protocol

router = APIRouter(prefix="/v1")

UPLOAD_TTL = 3600
OBJECT_TTL = 300
LANDMARK_COUNTS = (468, 478)


def scan_out(scan: Scan) -> ScanOut:
    return ScanOut(
        id=scan.id,
        status=scan.status,  # type: ignore[arg-type]
        source=scan.source,  # type: ignore[arg-type]
        created_at=aware(scan.created_at) or now(),
        completed_at=aware(scan.completed_at),
        reject_reasons=list(scan.reject_reasons or []),
        error=scan.error if scan.status == "failed" else None,
        report_id=scan.report.id if scan.report and scan.status == "complete" else None,
        images=[
            ImageState(
                view=image.view,  # type: ignore[arg-type]
                stored=bool(image.storage_key),
                purge_at=aware(image.purge_at) if image.storage_key else None,
                purged_at=aware(image.purged_at),
            )
            for image in scan.images
        ],
    )


def owned_scan(db: Session, scan_id: str, user: User) -> Scan:
    scan = db.get(Scan, scan_id)
    if scan is None or scan.user_id != user.id:
        raise HTTPException(404, "Scan not found.")
    return scan


@router.get("/capture-protocol")
def capture_protocol() -> dict:
    return protocol.as_dict()


@router.post("/scans", response_model=ScanCreated, status_code=201)
def create_scan(
    body: ScanCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ScanCreated:
    if user.age_blocked:
        raise HTTPException(403, "Facet is only for people aged 18 or older.")
    if not user.birth_year_verified:
        raise HTTPException(403, "Confirm that you are 18 or older before scanning.")
    consent = active_consent(db, user.id, "biometric_processing")
    if consent is None or consent.version != CONSENTS["biometric_processing"]["version"]:
        raise HTTPException(403, "Biometric consent is required before any capture.")
    if "front" not in body.views:
        raise HTTPException(422, "A front view is required.")
    if body.source == "camera":
        wait = next_scan_at(db, user, settings)
        if wait is not None:
            raise HTTPException(
                429,
                f"Scans are limited to one every {settings.scan_min_interval_days} days so that "
                f"re-scans show real change. Your next scan opens on {wait.date().isoformat()}.",
            )

    support = None
    if screen_text(body.goal_note).flagged:
        # Only the flag is kept; the note itself is never stored.
        user.wellbeing_flag_at = now()
        support = Support(**SUPPORT)

    scan = Scan(
        user_id=user.id,
        capture_protocol_version=CAPTURE_PROTOCOL_VERSION,
        source=body.source,
        goals=list(dict.fromkeys(body.goals)),
        age_range=body.age_range,
    )
    db.add(scan)
    db.flush()
    uploads: dict[str, str] = {}
    for view in dict.fromkeys(body.views):
        image = ScanImage(scan_id=scan.id, view=view)
        db.add(image)
        db.flush()
        if body.source == "camera":
            uploads[view] = f"/v1/uploads/{sign(settings.secret, 'upload', image.id, UPLOAD_TTL)}"
    db.commit()
    db.refresh(scan)
    return ScanCreated(scan=scan_out(scan), uploads=uploads, support=support)


@router.put("/uploads/{token}", status_code=204)
async def upload_image(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
) -> None:
    """The local equivalent of an S3 pre-signed PUT. The token names one scan_image."""
    payload = verify(settings.secret, token, "upload")
    if payload is None:
        raise HTTPException(403, "This upload link is invalid or has expired.")
    image = db.get(ScanImage, payload["s"])
    if image is None or image.scan.status != "uploaded":
        raise HTTPException(409, "This scan no longer accepts uploads.")
    declared = int(request.headers.get("content-length") or 0)
    if declared > settings.max_upload_bytes:
        raise HTTPException(413, "The image is too large.")
    data = await request.body()
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, "The image is too large.")
    try:
        with Image.open(io.BytesIO(data)) as raw:
            if raw.format not in ("JPEG", "PNG", "WEBP"):
                raise HTTPException(415, "Upload a JPEG, PNG or WebP image.")
            # Re-encode so no EXIF (location, device) is ever stored.
            clean = ImageOps.exif_transpose(raw).convert("RGB")
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(415, "The upload is not a readable image.") from error
    buffer = io.BytesIO()
    clean.save(buffer, format="JPEG", quality=92)
    key = f"scans/{image.scan_id}/{image.view}.jpg"
    storage.put(key, buffer.getvalue())
    image.storage_key = key
    image.width, image.height = clean.size
    image.purged_at = None
    # Until the report is delivered the image is on a short fuse, so abandoned scans do not linger.
    image.purge_at = now() + timedelta(hours=settings.abandoned_upload_hours)
    audit(
        db,
        user_id=image.scan.user_id,
        actor=f"user:{image.scan.user_id}",
        action="image.upload",
        target=f"{image.scan_id}/{image.view}",
    )
    db.commit()


def _validate_points(points: list[list[float]], label: str) -> None:
    if len(points) not in LANDMARK_COUNTS:
        raise HTTPException(422, f"{label}: expected 468 or 478 landmarks, got {len(points)}.")
    for point in points:
        if len(point) != 3 or not all(math.isfinite(c) for c in point):
            raise HTTPException(422, f"{label}: every landmark needs three finite coordinates.")


def _rounded(points: list[list[float]]) -> list[list[float]]:
    return [[round(c, 2) for c in point] for point in points]


@router.post("/scans/{scan_id}/submit", response_model=ScanOut)
def submit_scan(
    scan_id: str,
    body: ScanSubmit,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> ScanOut:
    """Lock the scan and enqueue processing."""
    scan = owned_scan(db, scan_id, user)
    if scan.status != "uploaded":
        raise HTTPException(409, "This scan was already submitted.")
    if "front" not in body.views:
        raise HTTPException(422, "A front view is required.")
    by_view = {image.view: image for image in scan.images}
    for view, submission in body.views.items():
        _validate_points(submission.landmarks, view)
        for index, extra in enumerate(submission.augmented):
            _validate_points(extra, f"{view} augmentation {index + 1}")
            if len(extra) != len(submission.landmarks):
                raise HTTPException(422, f"{view}: augmentations must match the landmark count.")
        image = by_view.get(view)
        if image is None:
            raise HTTPException(422, f"{view} is not part of this scan.")
        if scan.source == "camera" and not image.storage_key:
            raise HTTPException(409, f"Upload the {view} photo before submitting.")
        if image.width is None:
            image.width, image.height = submission.width, submission.height
        image.quality_json = {
            "client": {
                "blendshapes": {k: round(float(v), 4) for k, v in submission.blendshapes.items()},
                "liveness": submission.liveness,
            }
        }
        image.landmarks = LandmarkSet(
            model_version=body.model_version,
            points=_rounded(submission.landmarks),
            augmented=[_rounded(extra) for extra in submission.augmented],
        )
    for view, image in by_view.items():
        if view not in body.views:
            scan.images.remove(image)
    scan.status = "processing"
    scan.submitted_at = now()
    db.commit()
    request.app.state.queue.enqueue(scan.id)
    db.expire_all()
    return scan_out(owned_scan(db, scan_id, user))


@router.get("/scans", response_model=list[ScanOut])
def list_scans(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[ScanOut]:
    scans = db.scalars(select(Scan).where(Scan.user_id == user.id).order_by(Scan.created_at.desc()).limit(50)).all()
    return [scan_out(scan) for scan in scans]


@router.get("/scans/{scan_id}", response_model=ScanOut)
def get_scan(scan_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> ScanOut:
    return scan_out(owned_scan(db, scan_id, user))


@router.post("/scans/{scan_id}/images/purge", response_model=ScanOut)
def purge_scan_images(
    scan_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> ScanOut:
    """Immediate deletion of a scan's photos, at the user's request."""
    scan = owned_scan(db, scan_id, user)
    delete_scan_objects(db, storage, scan, actor=f"user:{user.id}", user_id=user.id)
    db.commit()
    return scan_out(scan)


def scan_for_image(db: Session, scan_id: str, request: Request, user: User | None, settings: Settings) -> Scan:
    """The scan, for its owner or for the PDF renderer holding a render token for its report."""
    scan = db.get(Scan, scan_id)
    if scan is not None and user is not None and scan.user_id == user.id:
        return scan
    token = request.query_params.get("render_token")
    payload = verify(settings.secret, token, "render") if token else None
    if scan is not None and payload is not None:
        report = db.get(Report, payload["s"])
        if report is not None and report.scan_id == scan.id:
            return scan
    raise HTTPException(404, "Scan not found.")


@router.get("/scans/{scan_id}/images/{view}", response_model=SignedUrl)
def image_url(
    scan_id: str,
    view: str,
    request: Request,
    user: User | None = Depends(optional_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SignedUrl:
    """A short-lived signed URL for one photo."""
    scan = scan_for_image(db, scan_id, request, user, settings)
    request.app.state.limiter.check(f"image:{scan.user_id}", settings.image_requests_per_minute)
    image = next((i for i in scan.images if i.view == view), None)
    if image is None or not image.storage_key:
        raise HTTPException(404, "This photo has been deleted.")
    actor = f"user:{user.id}" if user else "pdf-renderer"
    token = sign(settings.secret, "object", image.storage_key, OBJECT_TTL, u=scan.user_id, a=actor, t="image/jpeg")
    audit(db, user_id=scan.user_id, actor=actor, action="image.url", target=f"{scan.id}/{view}")
    db.commit()
    return SignedUrl(url=f"/v1/objects/{token}", expires_at=datetime.now(UTC) + timedelta(seconds=OBJECT_TTL))


@router.get("/objects/{token}")
def get_object(
    token: str,
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
) -> Response:
    payload = verify(settings.secret, token, "object")
    if payload is None:
        raise HTTPException(403, "This link is invalid or has expired.")
    key = payload["s"]
    if not storage.exists(key):
        raise HTTPException(404, "This file has been deleted.")
    audit(db, user_id=payload.get("u"), actor=payload.get("a", "unknown"), action="object.read", target=key)
    db.commit()
    headers = {"Cache-Control": "private, no-store"}
    if payload.get("f"):
        headers["Content-Disposition"] = f'inline; filename="{payload["f"]}"'
    return Response(storage.get(key), media_type=payload.get("t", "application/octet-stream"), headers=headers)


__all__ = ["router", "image_rate_limit"]
