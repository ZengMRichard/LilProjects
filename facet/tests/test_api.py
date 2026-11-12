"""The API end to end: onboarding gates, scans, tiers, progress, export and deletion."""

from __future__ import annotations

import io
import json
import zipfile
from dataclasses import replace
from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from facet_api.app import create_app
from facet_api.db import AuditLog, Scan, ScanImage, User, now
from facet_metrics.canonical import LANDMARKS
from facet_templates.banned import find_banned
from tests.conftest import MODEL, ORIGIN, camera_scan, onboard, sign_in, synthetic_scan, view_payload
from tests.helpers import face_image, render


def test_sign_in_requires_a_valid_single_use_link(client):
    assert client.get("/v1/me").status_code == 401
    assert client.post("/v1/auth/magic-link", json={"email": "not-an-email"}).status_code == 422
    token = client.post("/v1/auth/magic-link", json={"email": "Ada@Example.com"}).json()["dev_token"]
    me = client.post("/v1/auth/session", json={"token": token}).json()
    assert me["email"] == "ada@example.com" and not me["can_scan"]
    assert client.post("/v1/auth/session", json={"token": token}).status_code == 401, "links are single use"
    assert client.delete("/v1/auth/session").status_code == 204
    assert client.get("/v1/me").status_code == 401


def test_scanning_needs_the_age_gate_then_biometric_consent(client):
    sign_in(client)
    assert client.post("/v1/scans", json={"source": "synthetic"}).status_code == 403
    version = next(c["version"] for c in client.get("/v1/consents").json() if c["type"] == "biometric_processing")
    grant = {"type": "biometric_processing", "version": version}
    assert client.post("/v1/consents", json=grant).status_code == 403, "consent before the age gate"
    adult = date(date.today().year - 18, 1, 1).isoformat()
    assert client.post("/v1/me/age", json={"birth_date": adult}).json()["age_verified"]
    denied = client.post("/v1/scans", json={"source": "synthetic"})
    assert denied.status_code == 403 and "consent" in denied.json()["detail"].lower()
    assert client.post("/v1/consents", json={**grant, "version": "1999-01-01"}).status_code == 409
    assert client.post("/v1/consents", json=grant).status_code == 200
    assert client.get("/v1/me").json()["can_scan"]


def test_under_18_is_blocked_and_no_birth_date_is_stored(client, app):
    sign_in(client)
    almost = (date.today() - timedelta(days=365 * 18 - 30)).isoformat()
    me = client.post("/v1/me/age", json={"birth_date": almost}).json()
    assert me["age_blocked"] and not me["age_verified"] and not me["can_scan"]
    assert client.post("/v1/scans", json={"source": "synthetic"}).status_code == 403
    with app.state.sessions() as db:
        user = db.scalar(select(User))
        assert not any("birth_date" in column.name for column in User.__table__.columns)
        assert user.age_blocked


def test_consents_are_separate_and_unbundled(client):
    me = onboard(client)
    states = {c["type"]: c for c in me["consents"]}
    assert states["biometric_processing"]["granted"]
    assert not states["research_use"]["granted"], "research use is opt-in, never default"
    assert not states["analyst_review"]["available"]
    version = states["analyst_review"]["version"]
    assert client.post("/v1/consents", json={"type": "analyst_review", "version": version}).status_code == 409
    version = states["research_use"]["version"]
    after = client.post("/v1/consents", json={"type": "research_use", "version": version}).json()
    assert {c["type"]: c["granted"] for c in after}["research_use"]
    after = client.delete("/v1/consents/research_use").json()
    assert not {c["type"]: c["granted"] for c in after}["research_use"]


def test_synthetic_scan_produces_a_free_preview_then_a_full_report(client):
    onboard(client)
    scan = synthetic_scan(client)
    assert scan["status"] == "complete" and scan["report_id"]
    preview = client.get(f"/v1/reports/{scan['report_id']}").json()
    assert preview["tier"] == "free_preview" and preview["source"] == "synthetic"

    # Free preview: face shape, three headline proportions, skin snapshot, starter plan.
    assert preview["face_shape"]["label"] == "oval"
    unlocked = [m for m in preview["metrics"] if not m["locked"]]
    assert [m["key"] for m in unlocked] == preview["headline"] and len(unlocked) == 3
    assert all(m["value"] is None and m["meaning"] is None for m in preview["metrics"] if m["locked"])
    assert preview["symmetry"] is None and preview["summary"] is None
    assert preview["skin"]["status"] == "unavailable"
    assert len(preview["plan"]["items"]) == 3 and preview["plan"]["locked_count"] > 0
    assert client.get(f"/v1/reports/{scan['report_id']}/pdf").status_code == 403

    paid = client.post("/v1/billing/checkout", json={"report_id": scan["report_id"]}).json()
    assert paid == {"status": "paid", "provider": "dev", "tier": "full", "amount_usd": 0}
    full = client.get(f"/v1/reports/{scan['report_id']}").json()
    assert full["tier"] == "full" and not any(m["locked"] for m in full["metrics"])
    assert len(full["metrics"]) == 16
    assert full["symmetry"]["overall"]["display"] == "1.000"
    assert len(full["symmetry"]["regions"]) == 6
    assert full["plan"]["locked_count"] == 0
    assert full["summary"]["source"] == "template"
    assert {u["key"] for u in full["unavailable"]} == {"face.thirds.upper", "eyes.upper_lid_exposure"}
    assert full["disclaimer"] == "General information, not a diagnosis or medical advice."


def test_metric_cards_follow_the_card_pattern(client):
    """What was measured, your value, the typical range, what it means, how confident."""
    onboard(client)
    scan = synthetic_scan(client)
    client.post("/v1/billing/checkout", json={"report_id": scan["report_id"]})
    report = client.get(f"/v1/reports/{scan['report_id']}").json()
    cards = {m["key"]: m for m in report["metrics"]}

    tilt = cards["eyes.canthal_tilt"]
    assert tilt["what"] and tilt["display"].startswith("+") and tilt["display"].endswith("°")
    assert tilt["reference"]["range_display"] == "1° to 9°" and tilt["reference"]["provisional"]
    assert tilt["reference"]["side"] in ("below", "typical", "above") and tilt["meaning"]
    assert tilt["ci_low"] < tilt["value"] < tilt["ci_high"] and tilt["confidence"] in ("high", "medium", "low")
    assert tilt["landmarks"] == ["endocanthion", "exocanthion"]

    for key in ("nose.nasofrontal_angle", "nose.nasolabial_angle", "jaw.gonial_angle", "jaw.chin_projection"):
        card = cards[key]
        assert card["experimental"] and card["reference"] is None and card["confidence"] == "low", key
        assert "Experimental" in card["meaning"]

    assert report["reference_group"]["provisional"] and report["reference_group"]["source"] is None
    narrative = " ".join(
        [report["summary"]["text"], *(m["meaning"] for m in report["metrics"]), report["face_shape"]["text"]]
    )
    assert find_banned(narrative) == ()
    assert len(report["geometry"]["frontal"]) == 468
    assert set(report["poses"]) == {"front", "left", "right"}


def test_camera_scan_stores_encrypted_images_and_reports_skin(client, app, settings):
    onboard(client)
    scan = camera_scan(client, image_kwargs={"cheek_tint": (26, -8, -8), "under_eye_shade": 40})
    assert scan["status"] == "complete", scan
    assert all(image["stored"] and image["purge_at"] for image in scan["images"])

    report = client.get(f"/v1/reports/{scan['report_id']}").json()
    skin = {a["key"]: a for a in report["skin"]["attributes"]}
    assert report["skin"]["status"] == "ok" and "Experimental" in report["skin"]["note"]
    assert skin["redness"]["band"] in ("medium", "high")
    assert skin["under_eye"]["band"] in ("medium", "high")
    assert skin["pores"]["band"] is None and "Not assessed" in skin["pores"]["text"]
    assert report["geometry"]["image"]["available"]

    # At rest the object is ciphertext, not a JPEG.
    stored = (settings.data_dir / "objects" / "scans" / scan["id"] / "front.jpg").read_bytes()
    assert b"JFIF" not in stored and not stored.startswith(b"\xff\xd8")

    # Reading it back goes through a short-lived signed URL, and every read is audited.
    signed = client.get(f"/v1/scans/{scan['id']}/images/front").json()
    image = client.get(signed["url"])
    assert image.status_code == 200 and image.content.startswith(b"\xff\xd8")
    assert image.headers["cache-control"] == "private, no-store"
    assert client.get(signed["url"][:-6] + "AAAAAA").status_code == 403
    actions = [entry["action"] for entry in client.get("/v1/me/audit").json()]
    assert {"image.upload", "image.read", "image.url", "object.read", "consent.grant"} <= set(actions)

    plain = camera_scan(client)
    calm = {a["key"]: a for a in client.get(f"/v1/reports/{plain['report_id']}").json()["skin"]["attributes"]}
    assert calm["redness"]["band"] == "low" and calm["under_eye"]["band"] == "low"


def test_quality_gate_rejects_and_deletes(client, app):
    onboard(client)
    turned = camera_scan(client, front=render(yaw=12))
    assert turned["status"] == "rejected" and turned["report_id"] is None
    assert any("yaw" in reason and "turn your head" in reason for reason in turned["reject_reasons"])
    assert not any(image["stored"] for image in turned["images"]), "a rejected scan keeps no photos"

    dark = camera_scan(client, image_kwargs={"brightness": 0.15})
    assert dark["status"] == "rejected" and any("too dark" in r for r in dark["reject_reasons"])

    blurry = camera_scan(client, image_kwargs={"blur": 6.0, "noise": 0.0})
    assert blurry["status"] == "rejected" and any("blurry" in r for r in blurry["reject_reasons"])

    def open_mouth(index, x, y, z):
        return (x, y - 1.2, z) if index == LANDMARKS["stomion_lower"] else (x, y, z)

    mouth = camera_scan(client, front=render(warp=open_mouth))
    assert mouth["status"] == "rejected" and any("mouth" in r for r in mouth["reject_reasons"])

    no_blink = camera_scan(client, liveness=False)
    assert no_blink["status"] == "rejected" and any("blink" in r for r in no_blink["reject_reasons"])

    with app.state.sessions() as db:
        quality = db.scalar(
            select(ScanImage).where(ScanImage.scan_id == turned["id"], ScanImage.view == "front")
        ).quality_json
        tamper = next(c for c in quality["server"]["checks"] if c["key"] == "tamper")
        assert tamper["passed"] is None and "Not evaluated" in tamper["detail"]


def test_submit_validates_landmarks_and_locks_the_scan(client):
    onboard(client)
    scan = client.post("/v1/scans", json={"source": "synthetic"}).json()["scan"]
    url = f"/v1/scans/{scan['id']}/submit"
    bad = view_payload(render()[:400])
    assert client.post(url, json={"model_version": MODEL, "views": {"front": bad}}).status_code == 422
    nan = view_payload(render())
    nan["landmarks"][3] = [1.0, 2.0]
    assert client.post(url, json={"model_version": MODEL, "views": {"front": nan}}).status_code == 422
    assert (
        client.post(url, json={"model_version": MODEL, "views": {"left": view_payload(render(yaw=-46))}}).status_code
        == 422
    )
    ok = client.post(url, json={"model_version": MODEL, "views": {"front": view_payload(render())}})
    assert ok.status_code == 200 and ok.json()["status"] == "complete"
    assert [i["view"] for i in ok.json()["images"]] == ["front"]
    assert (
        client.post(url, json={"model_version": MODEL, "views": {"front": view_payload(render())}}).status_code == 409
    )

    camera = client.post("/v1/scans", json={"source": "camera"}).json()
    missing = client.post(
        f"/v1/scans/{camera['scan']['id']}/submit",
        json={"model_version": MODEL, "views": {"front": view_payload(render())}},
    )
    assert missing.status_code == 409 and "Upload the front photo" in missing.json()["detail"]


def test_uploads_need_a_valid_token_and_a_real_image(client):
    onboard(client)
    created = client.post("/v1/scans", json={"source": "camera"}).json()
    url = created["uploads"]["front"]
    assert client.put(url + "x", content=b"1").status_code == 403
    assert client.put(url, content=b"not an image").status_code == 415
    assert client.put(url, content=face_image(render())).status_code == 204


def test_one_scan_per_fourteen_days(strict_settings):
    app = create_app(strict_settings)
    with TestClient(app, headers={"origin": ORIGIN}) as client:
        onboard(client)
        first = camera_scan(client)
        assert first["status"] == "complete"
        me = client.get("/v1/me").json()
        assert not me["can_scan"] and me["next_scan_at"]
        blocked = client.post("/v1/scans", json={"source": "camera"})
        assert blocked.status_code == 429 and "14 days" in blocked.json()["detail"]
        # Rejected scans and the synthetic sample do not use up the allowance.
        assert client.post("/v1/scans", json={"source": "synthetic"}).status_code == 201
        with app.state.sessions() as db:
            scan = db.get(Scan, first["id"])
            scan.completed_at = now() - timedelta(days=15)
            db.commit()
        assert client.post("/v1/scans", json={"source": "camera"}).status_code == 201


def test_progress_reports_deltas_and_noise(client):
    onboard(client)
    assert client.get("/v1/progress").json()["metrics"] == []
    synthetic_scan(client)

    def wider_jaw(index, x, y, z):
        return (x * 1.12, y, z) if index in (LANDMARKS["gonion_r"], LANDMARKS["gonion_l"]) else (x, y, z)

    synthetic_scan(client, warp=wider_jaw)
    progress = client.get("/v1/progress").json()
    assert progress["source"] == "synthetic" and len(progress["scans"]) == 2
    metrics = {m["key"]: m for m in progress["metrics"]}
    jaw = metrics["jaw.bigonial_bizygomatic"]
    assert len(jaw["points"]) == 2 and jaw["delta"] > 0.05 and jaw["within_noise"] is False
    assert jaw["delta_display"].startswith("+") and jaw["reference_low"] == 0.68
    assert metrics["eyes.canthal_tilt"]["within_noise"] is True
    assert metrics["nose.nasofrontal_angle"]["reference_low"] is None


def test_plan_items_can_be_tracked(client):
    onboard(client)
    scan = synthetic_scan(client, goals=("skin", "jaw"))
    client.post("/v1/billing/checkout", json={"report_id": scan["report_id"]})
    plan = client.get("/v1/plan").json()
    assert plan["report_id"] == scan["report_id"] and plan["preface"]
    categories = [item["category"] for item in plan["items"]]
    assert categories.index("skincare") < categories.index("professional")
    first = plan["items"][0]
    updated = client.patch(f"/v1/plan/{first['id']}", json={"status": "doing"}).json()
    assert updated["status"] == "doing"
    assert client.patch("/v1/plan/pln_missing", json={"status": "done"}).status_code == 404
    assert client.patch(f"/v1/plan/{first['id']}", json={"status": "bogus"}).status_code == 422


def test_distress_in_goals_shows_support_and_pauses_upsells(client, app):
    onboard(client)
    scan = synthetic_scan(client, goal_note="I hate my face and feel hopeless")
    assert scan["support"]["resources"][0]["name"].startswith("988")
    me = client.get("/v1/me").json()
    assert me["upsells_paused"]
    report = client.get(f"/v1/reports/{scan['report_id']}").json()
    assert report["upsell"]["paused"] and report["support"]["title"]
    with app.state.sessions() as db:
        dumped = json.dumps([str(row.__dict__) for row in db.scalars(select(Scan)).all()])
        assert "hopeless" not in dumped, "the free-text note is never stored"

    calm = TestClient(app, headers={"origin": ORIGIN})
    onboard(calm, "bo@example.com")
    other = synthetic_scan(calm, goal_note="curious about a haircut")
    assert other["support"] is None
    assert not calm.get(f"/v1/reports/{other['report_id']}").json()["upsell"]["paused"]


def test_reports_are_private_to_their_owner(client, app):
    onboard(client)
    scan = camera_scan(client)
    other = TestClient(app, headers={"origin": ORIGIN})
    onboard(other, "eve@example.com")
    assert other.get(f"/v1/reports/{scan['report_id']}").status_code == 404
    assert other.get(f"/v1/scans/{scan['id']}").status_code == 404
    assert other.get(f"/v1/scans/{scan['id']}/images/front").status_code == 404
    assert other.post("/v1/billing/checkout", json={"report_id": scan["report_id"]}).status_code == 404
    assert other.post(f"/v1/scans/{scan['id']}/images/purge").status_code == 404
    assert other.get(f"/v1/reports/{scan['report_id']}?render_token=forged.token").status_code == 404
    anonymous = TestClient(app)
    assert anonymous.get(f"/v1/reports/{scan['report_id']}").status_code == 404


def test_cross_site_writes_are_refused(app):
    evil = TestClient(app, headers={"origin": "https://evil.example"})
    assert evil.post("/v1/auth/magic-link", json={"email": "a@b.co"}).status_code == 403
    assert evil.get("/v1/health").status_code == 200
    # A forged forwarded host does not help: the browser sets Origin, and it still names the attacker.
    assert (
        evil.post(
            "/v1/auth/magic-link", json={"email": "a@b.co"}, headers={"x-forwarded-host": "facet.example"}
        ).status_code
        == 403
    )


def test_same_origin_requests_through_the_web_proxy_are_allowed(app):
    """Whatever host the web app is served on, a request from that same host is same-origin."""
    proxied = TestClient(app, headers={"origin": "http://192.168.1.20:3000", "x-forwarded-host": "192.168.1.20:3000"})
    assert proxied.post("/v1/auth/magic-link", json={"email": "a@b.co"}).status_code == 200
    direct = TestClient(app, base_url="http://127.0.0.1:8787", headers={"origin": "http://127.0.0.1:8787"})
    assert direct.post("/v1/auth/magic-link", json={"email": "a@b.co"}).status_code == 200


def test_export_contains_everything_and_delete_removes_everything(client, app, settings):
    onboard(client)
    scan = camera_scan(client)
    export = client.get("/v1/me/export")
    assert export.headers["content-type"] == "application/zip"
    archive = zipfile.ZipFile(io.BytesIO(export.content))
    names = set(archive.namelist())
    assert {"facet-export.json", f"images/{scan['id']}/front.jpg"} <= names
    document = json.loads(archive.read("facet-export.json"))
    assert document["user"]["email"] == "ada@example.com"
    assert document["scans"][0]["metrics"] and len(document["scans"][0]["images"][0]["landmarks"]) == 468
    assert document["consents"][0]["type"] == "biometric_processing"

    assert client.delete("/v1/me").status_code == 204
    assert client.get("/v1/me").status_code == 401
    objects = [p for p in (settings.data_dir / "objects").rglob("*") if p.is_file()]
    assert objects == []
    with app.state.sessions() as db:
        assert db.scalars(select(User)).all() == [] and db.scalars(select(Scan)).all() == []
        assert db.scalars(select(ScanImage)).all() == []
        actions = {row.action for row in db.scalars(select(AuditLog)).all()}
        assert {"account.delete", "image.delete"} <= actions, "the audit trail survives deletion"


def test_revoking_biometric_consent_deletes_images_and_landmarks(client, app):
    onboard(client)
    scan = camera_scan(client)
    client.delete("/v1/consents/biometric_processing")
    after = client.get(f"/v1/scans/{scan['id']}").json()
    assert not any(image["stored"] for image in after["images"])
    with app.state.sessions() as db:
        assert all(image.landmarks is None for image in db.scalars(select(ScanImage)).all())
    assert client.post("/v1/scans", json={"source": "synthetic"}).status_code == 403


def test_analyst_review_is_not_offered_yet(client):
    onboard(client)
    scan = synthetic_scan(client)
    response = client.post(f"/v1/reports/{scan['report_id']}/review")
    assert response.status_code == 501 and "v2" in response.json()["detail"]


def test_production_refuses_dev_shortcuts(settings):
    app = create_app(replace(settings, env="prod"))
    with TestClient(app, headers={"origin": ORIGIN}) as client:
        assert client.post("/v1/auth/magic-link", json={"email": "a@b.co"}).status_code == 503
        assert client.get("/v1/openapi.json").status_code == 404


def test_capture_protocol_is_published(client):
    protocol = client.get("/v1/capture-protocol").json()
    assert protocol["views"]["front"]["yaw"] == [-5.0, 5.0]
    assert protocol["tta_count"] == 8 and protocol["captured_views"] == ["front", "left", "right"]
