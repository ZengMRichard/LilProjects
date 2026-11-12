from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest
from fastapi.testclient import TestClient

from facet_api.app import create_app
from facet_api.config import Settings
from tests.helpers import augmentations, face_image, render

ORIGIN = "http://localhost:3000"
MODEL = "test-landmarker-1"


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        env="dev",
        data_dir=tmp_path,
        db_url=f"sqlite:///{tmp_path / 'facet.db'}",
        scan_min_interval_days=0,
        worker_inline=True,
        secret=b"s" * 32,
        storage_key=b"k" * 32,
    )


@pytest.fixture
def app(settings):
    return create_app(settings)


@pytest.fixture
def client(app):
    with TestClient(app, headers={"origin": ORIGIN}) as test_client:
        yield test_client


def sign_in(client: TestClient, email: str = "ada@example.com") -> dict:
    token = client.post("/v1/auth/magic-link", json={"email": email}).json()["dev_token"]
    response = client.post("/v1/auth/session", json={"token": token})
    assert response.status_code == 200, response.text
    return response.json()


def onboard(client: TestClient, email: str = "ada@example.com") -> dict:
    """Sign in, pass the age gate and grant biometric consent."""
    sign_in(client, email)
    adult = date(date.today().year - 30, 1, 1).isoformat()
    assert client.post("/v1/me/age", json={"birth_date": adult}).status_code == 200
    version = next(c["version"] for c in client.get("/v1/consents").json() if c["type"] == "biometric_processing")
    response = client.post("/v1/consents", json={"type": "biometric_processing", "version": version})
    assert response.status_code == 200, response.text
    return client.get("/v1/me").json()


def view_payload(points, *, liveness: bool = True, with_augmentations: bool = True, size=(720, 960)) -> dict:
    return {
        "width": size[0],
        "height": size[1],
        "landmarks": points,
        "augmented": augmentations(points) if with_augmentations else [],
        "blendshapes": {"smile": 0.02, "jaw_open": 0.01},
        "liveness": liveness,
    }


def synthetic_scan(client: TestClient, *, warp=None, goals=("skin",), goal_note=None) -> dict:
    created = client.post("/v1/scans", json={"source": "synthetic", "goals": list(goals), "goal_note": goal_note})
    assert created.status_code == 201, created.text
    scan = created.json()["scan"]
    views = {
        "front": view_payload(render(warp=warp)),
        "left": view_payload(render(yaw=-46, warp=warp)),
        "right": view_payload(render(yaw=46, warp=warp)),
    }
    submitted = client.post(f"/v1/scans/{scan['id']}/submit", json={"model_version": MODEL, "views": views})
    assert submitted.status_code == 200, submitted.text
    return {**submitted.json(), "support": created.json()["support"]}


def camera_scan(client: TestClient, *, front=None, image_kwargs=None, liveness: bool = True, goals=("skin",)) -> dict:
    """A scan with real uploads: flat-shaded face images drawn from the same landmarks."""
    created = client.post("/v1/scans", json={"source": "camera", "goals": list(goals)})
    assert created.status_code == 201, created.text
    body = created.json()
    poses = {"front": front or render(), "left": render(yaw=-46), "right": render(yaw=46)}
    for view, points in poses.items():
        kwargs = image_kwargs if view == "front" and image_kwargs else {}
        upload = client.put(
            body["uploads"][view], content=face_image(points, **kwargs), headers={"content-type": "image/jpeg"}
        )
        assert upload.status_code == 204, upload.text
    views = {view: view_payload(points, liveness=liveness) for view, points in poses.items()}
    submitted = client.post(f"/v1/scans/{body['scan']['id']}/submit", json={"model_version": MODEL, "views": views})
    assert submitted.status_code == 200, submitted.text
    return submitted.json()


@pytest.fixture
def strict_settings(settings) -> Settings:
    return replace(settings, scan_min_interval_days=14)
