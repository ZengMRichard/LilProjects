from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from almanac.api.app import create_app
from almanac.config import Settings
from almanac.store.db import Store

TOKEN = "test-token"
BASE = "http://127.0.0.1:8765"
# A fixed clock: Wednesday 2026-09-30, 18:00 UTC (14:00 New York, market open).
NOW = datetime(2026, 9, 30, 18, 0, tzinfo=UTC)


@pytest.fixture
def settings(tmp_path):
    return Settings(home=tmp_path, mode="demo")


@pytest.fixture
def app(settings):
    return create_app(settings, token=TOKEN, store=Store(":memory:"), clock=lambda: NOW)


@pytest.fixture
def client(app):
    with TestClient(app, base_url=BASE, headers={"X-Almanac-Token": TOKEN}) as c:
        yield c
