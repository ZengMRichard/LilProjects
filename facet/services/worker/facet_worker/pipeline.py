"""The worker pipeline: one submitted scan in, one report out."""

from __future__ import annotations

import io
import logging
from datetime import timedelta

from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from facet_api import CAPTURE_PROTOCOL_VERSION
from facet_api.config import Settings
from facet_api.db import MetricResult, PlanItem, Report, Scan, ScanImage, audit, now
from facet_api.storage import Storage
from facet_metrics import METRICS_LIB_VERSION, ViewLandmarks, compute_report_metrics
from facet_metrics.registry import BY_KEY
from facet_norms import band_side, load_norms, place
from facet_templates import TEMPLATES_VERSION
from facet_templates.narrative import Finding, findings_brief, summary
from facet_templates.plan import build_plan
from facet_worker.narrative_llm import rewrite_summary
from facet_worker.quality import ViewQuality, assess_view
from facet_worker.skin import SKIN_VERSION, analyze_skin

log = logging.getLogger("facet.worker")

MAX_ATTEMPTS = 3


def delete_image(db: Session, storage: Storage, image: ScanImage, *, actor: str, user_id: str | None) -> bool:
    """Delete one stored image and record it. Returns True if an object was removed."""
    if not image.storage_key:
        return False
    storage.delete(image.storage_key)
    audit(db, user_id=user_id, actor=actor, action="image.delete", target=f"{image.scan_id}/{image.view}")
    image.storage_key = None
    image.purged_at = now()
    return True


def _load_image(storage: Storage, image: ScanImage) -> Image.Image | None:
    if not image.storage_key or not storage.exists(image.storage_key):
        return None
    try:
        loaded = Image.open(io.BytesIO(storage.get(image.storage_key)))
        loaded.load()
        return loaded
    except (UnidentifiedImageError, OSError):
        return None


def process_scan(db: Session, scan_id: str, storage: Storage, settings: Settings) -> None:
    """Run the pipeline for one scan. Safe to retry: results are replaced, not appended."""
    scan = db.get(Scan, scan_id)
    if scan is None or scan.status not in ("processing", "failed"):
        return
    scan.attempts += 1
    scan.status = "processing"
    db.commit()
    try:
        _run(db, scan, storage, settings)
        db.commit()
    except Exception as error:
        db.rollback()
        scan = db.get(Scan, scan_id)
        if scan is not None:
            scan.status = "failed"
            scan.error = f"{type(error).__name__}: {error}"[:500]
            db.commit()
        log.exception("scan %s failed on attempt %s", scan_id, scan.attempts if scan else "?")
        raise


def _run(db: Session, scan: Scan, storage: Storage, settings: Settings) -> None:
    synthetic = scan.source == "synthetic"
    images = {image.view: image for image in scan.images if image.landmarks is not None}
    if "front" not in images:
        scan.status = "rejected"
        scan.reject_reasons = ["front: no landmarks were submitted for the front view."]
        return

    # 1. Quality gate.
    pixels: dict[str, Image.Image | None] = {}
    quality: dict[str, ViewQuality] = {}
    for view, image in images.items():
        pixels[view] = _load_image(storage, image)
        if pixels[view] is not None and image.storage_key:
            audit(db, user_id=scan.user_id, actor="worker", action="image.read", target=f"{scan.id}/{view}")
        assert image.landmarks is not None
        client = image.quality_json.get("client", {}) if isinstance(image.quality_json, dict) else {}
        quality[view] = assess_view(view, image.landmarks.points, pixels[view], hints=client, synthetic=synthetic)
        image.quality_json = {"client": client, "server": quality[view].as_dict()}
    failures = [reason for q in quality.values() for reason in q.failures()]
    if failures:
        scan.status = "rejected"
        scan.reject_reasons = failures
        # A rejected scan produces nothing, so its images are deleted now rather than kept.
        for image in scan.images:
            delete_image(db, storage, image, actor="worker", user_id=scan.user_id)
        return

    # 2-3. Landmarks arrived with the scan; compute metrics with uncertainty.
    views = {
        view: ViewLandmarks(view, image.landmarks.points, image.landmarks.augmented or [])
        for view, image in images.items()
        if image.landmarks is not None
    }
    result = compute_report_metrics(views)
    norms = load_norms()
    group = norms.group(scan.reference_group)

    scan.metrics.clear()
    db.flush()
    findings: list[Finding] = []
    for key, measured in result.values.items():
        spec = BY_KEY.get(key)
        entry = group.metrics.get(key) if spec is not None and not spec.experimental else None
        placement = place(measured.value, entry) if entry else None
        scan.metrics.append(
            MetricResult(
                metric_key=key,
                value=measured.value,
                ci_low=measured.ci_low,
                ci_high=measured.ci_high,
                reference_group=group.key if placement else None,
                percentile_band=placement.band if placement else None,
                metrics_lib_version=METRICS_LIB_VERSION,
            )
        )
        if spec is not None:
            findings.append(
                Finding(
                    key=key,
                    unit=spec.unit,
                    value=measured.value,
                    band=band_side(placement.band) if placement else None,
                    low=placement.low if placement else None,
                    high=placement.high if placement else None,
                )
            )

    # Skin snapshot, from the front image only.
    front_image = pixels.get("front")
    skin_bands: dict[str, str] = {}
    if front_image is not None:
        attributes = analyze_skin(front_image, images["front"].landmarks.points, quality["front"].ipd_px)  # type: ignore[union-attr]
        skin = {
            "status": "ok",
            "version": SKIN_VERSION,
            "attributes": [
                {"key": a.key, "label": a.label, "band": a.band, "value": a.value, "text": a.text} for a in attributes
            ],
        }
        for attribute in attributes:
            if attribute.band is not None and attribute.value is not None:
                skin_bands[attribute.key] = attribute.band
                scan.metrics.append(
                    MetricResult(
                        metric_key=f"skin.{attribute.key}",
                        value=attribute.value,
                        percentile_band=attribute.band,
                        metrics_lib_version=SKIN_VERSION,
                    )
                )
    else:
        reason = (
            "The synthetic sample has no photo, so there is no skin to assess."
            if synthetic
            else "The front photo was not available, so the skin snapshot was skipped."
        )
        skin = {"status": "unavailable", "version": SKIN_VERSION, "reason": reason, "attributes": []}

    # 4. Narrative: template first, optional guarded LLM rewrite of the summary only.
    symmetry_index = result.values["symmetry.overall"].value
    template_summary = summary(findings, symmetry_index, norms.provisional)
    text, source = rewrite_summary(
        findings_brief(findings, symmetry_index),
        template_summary,
        enabled=settings.llm_narrative,
        model=settings.llm_model,
    )

    assert result.symmetry is not None and result.face_shape is not None and result.front is not None
    front_points = images["front"].landmarks.points  # type: ignore[union-attr]
    narrative = {
        "versions": {
            "metrics_lib": METRICS_LIB_VERSION,
            "landmark_model": images["front"].landmarks.model_version,  # type: ignore[union-attr]
            "norms": norms.version,
            "templates": TEMPLATES_VERSION,
            "skin": SKIN_VERSION,
            "capture_protocol": CAPTURE_PROTOCOL_VERSION,
        },
        "summary": {"text": text, "source": source},
        "face_shape": {
            "label": result.face_shape.label,
            "runner_up": result.face_shape.runner_up,
            "length_to_width": round(result.face_shape.length_to_width, 4),
            "forehead_to_cheek": round(result.face_shape.forehead_to_cheek, 4),
            "jaw_to_cheek": round(result.face_shape.jaw_to_cheek, 4),
        },
        "figures": result.figures,
        "symmetry": {
            "regions": {k: round(v, 5) for k, v in result.symmetry.regions.items()},
            "pairs": [[p.right, p.left, p.region, round(p.deviation, 5)] for p in result.symmetry.pairs],
        },
        "geometry": {
            "frontal": [[round(p[0], 4), round(p[1], 4)] for p in result.front.points],
            "image": {
                "width": images["front"].width,
                "height": images["front"].height,
                "points": [[round(p[0], 1), round(p[1], 1)] for p in front_points],
            },
        },
        "skin": skin,
        "unavailable": [{"key": u.key, "reason": u.reason} for u in result.unavailable],
        "poses": {
            view: {"yaw": round(p.yaw, 2), "pitch": round(p.pitch, 2), "roll": round(p.roll, 2)}
            for view, p in result.poses.items()
        },
        "views": sorted(views),
    }

    # Report and plan. A retry replaces the previous report.
    if scan.report is not None:
        db.delete(scan.report)
        db.flush()
    report = Report(scan_id=scan.id, tier="free_preview", narrative_json=narrative, status="ready")
    db.add(report)
    db.flush()
    for position, item in enumerate(build_plan(tuple(scan.goals or ()), skin_bands)):
        db.add(
            PlanItem(
                user_id=scan.user_id,
                report_id=report.id,
                key=item.key,
                position=position,
                category=item.category,
                action=item.action,
                detail=item.detail,
                reason=item.reason,
                evidence_level=item.evidence_level,
                evidence_note=item.evidence_note,
            )
        )

    finished = now()
    scan.status = "complete"
    scan.completed_at = finished
    scan.error = None
    for image in scan.images:
        if image.storage_key:
            image.purge_at = finished + timedelta(days=settings.image_retention_days)
