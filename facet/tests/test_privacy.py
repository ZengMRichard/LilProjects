"""Privacy checks (spec sections 8 and 11): purge jobs run and no image outlives its purge_at."""

from __future__ import annotations

import io
from datetime import timedelta

from PIL import Image
from sqlalchemy import select

from facet_api.db import AuditLog, ScanImage, now
from facet_api.purge import overdue_images, purge_expired
from facet_api.storage import LocalEncryptedStorage
from tests.conftest import camera_scan, onboard
from tests.helpers import face_image, render


def test_delivered_images_get_a_thirty_day_purge_date(client, app, settings):
    onboard(client)
    scan = camera_scan(client)
    with app.state.sessions() as db:
        for image in db.scalars(select(ScanImage).where(ScanImage.scan_id == scan["id"])).all():
            remaining = image.purge_at.replace(tzinfo=None) - now().replace(tzinfo=None)
            assert timedelta(days=29, hours=23) < remaining <= timedelta(days=settings.image_retention_days)


def test_purge_job_deletes_expired_images_and_nothing_outlives_purge_at(client, app, settings):
    onboard(client)
    old = camera_scan(client)
    fresh = camera_scan(client)
    with app.state.sessions() as db:
        for image in db.scalars(select(ScanImage).where(ScanImage.scan_id == old["id"])).all():
            image.purge_at = now() - timedelta(hours=2)
        db.commit()
        assert overdue_images(db) == 3
        assert client.get("/v1/health").json()["overdue_images"] == 3

        assert purge_expired(db, app.state.storage) == 3
        assert overdue_images(db) == 0
        assert purge_expired(db, app.state.storage) == 0, "idempotent"
        deletions = db.scalars(select(AuditLog).where(AuditLog.action == "image.delete")).all()
        assert len(deletions) == 3 and {row.actor for row in deletions} == {"purge-job"}

    root = settings.data_dir / "objects" / "scans"
    assert not any((root / old["id"]).glob("*.jpg"))
    assert len(list((root / fresh["id"]).glob("*.jpg"))) == 3
    assert client.get(f"/v1/scans/{old['id']}/images/front").status_code == 404
    # The report survives its photos: landmarks and metrics are kept.
    report = client.get(f"/v1/reports/{old['report_id']}").json()
    assert not report["geometry"]["image"]["available"] and len(report["metrics"]) == 16


def test_abandoned_uploads_are_on_a_one_day_fuse(client, app):
    onboard(client)
    created = client.post("/v1/scans", json={"source": "camera"}).json()
    client.put(created["uploads"]["front"], content=face_image(render()))
    with app.state.sessions() as db:
        image = db.scalar(select(ScanImage).where(ScanImage.storage_key.is_not(None)))
        remaining = image.purge_at.replace(tzinfo=None) - now().replace(tzinfo=None)
        assert timedelta(hours=23) < remaining <= timedelta(hours=24)
        image.purge_at = now() - timedelta(minutes=1)
        db.commit()
        assert purge_expired(db, app.state.storage) == 1


def test_user_can_delete_photos_immediately(client, settings):
    onboard(client)
    scan = camera_scan(client)
    after = client.post(f"/v1/scans/{scan['id']}/images/purge").json()
    assert not any(image["stored"] for image in after["images"])
    assert all(image["purged_at"] for image in after["images"])
    assert not any((settings.data_dir / "objects").rglob("*.jpg"))
    assert client.get(f"/v1/reports/{scan['report_id']}").status_code == 200


def test_uploads_are_stripped_of_metadata(client, app):
    onboard(client)
    created = client.post("/v1/scans", json={"source": "camera"}).json()
    source = Image.open(io.BytesIO(face_image(render())))
    exif = Image.Exif()
    exif[0x010F] = "SecretCameraMaker"
    exif[0x8825] = {1: "N", 2: (51.0, 30.0, 0.0)}  # GPS
    buffer = io.BytesIO()
    source.save(buffer, format="JPEG", exif=exif)
    assert b"SecretCameraMaker" in buffer.getvalue()
    assert client.put(created["uploads"]["front"], content=buffer.getvalue()).status_code == 204
    stored = app.state.storage.get(f"scans/{created['scan']['id']}/front.jpg")
    assert b"SecretCameraMaker" not in stored
    assert not Image.open(io.BytesIO(stored)).getexif()


def test_storage_is_authenticated_encryption(tmp_path):
    storage = LocalEncryptedStorage(tmp_path, b"k" * 32)
    storage.put("scans/a/front.jpg", b"plain image bytes")
    path = tmp_path / "scans" / "a" / "front.jpg"
    assert b"plain image bytes" not in path.read_bytes()
    assert storage.get("scans/a/front.jpg") == b"plain image bytes"
    other = LocalEncryptedStorage(tmp_path, b"z" * 32)
    try:
        other.get("scans/a/front.jpg")
    except Exception as error:  # noqa: BLE001
        assert type(error).__name__ == "InvalidTag"
    else:
        raise AssertionError("a different key must not decrypt")
    for bad in ("../escape", "a/../../b", "has space"):
        try:
            storage.put(bad, b"x")
        except ValueError:
            continue
        raise AssertionError(f"{bad!r} should be rejected")
