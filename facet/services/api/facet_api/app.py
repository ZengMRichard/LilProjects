"""The FastAPI application."""

from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from facet_api import API_VERSION
from facet_api.config import Settings, load_settings
from facet_api.db import make_engine, make_session_factory
from facet_api.deps import RateLimiter, get_db, get_settings
from facet_api.purge import overdue_images, purge_expired
from facet_api.routes import auth, reports, scans
from facet_api.schemas import Health
from facet_api.storage import LocalEncryptedStorage
from facet_worker.jobs import LocalQueue

log = logging.getLogger("facet.api")
PURGE_INTERVAL_SECONDS = 600
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    engine = make_engine(settings.db_url)
    sessions = make_session_factory(engine)
    storage = LocalEncryptedStorage(settings.data_dir / "objects", settings.storage_key)
    jobs = LocalQueue(sessions, storage, settings)
    stop = threading.Event()

    def purge_loop() -> None:
        while not stop.is_set():
            try:
                with sessions() as db:
                    removed = purge_expired(db, storage)
                if removed:
                    log.info("purge job deleted %s image(s)", removed)
            except Exception:  # noqa: BLE001 - the job must keep running
                log.exception("purge job failed")
            stop.wait(PURGE_INTERVAL_SECONDS)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        jobs.start()
        thread = threading.Thread(target=purge_loop, name="facet-purge", daemon=True)
        thread.start()
        yield
        stop.set()
        jobs.stop()

    app = FastAPI(
        title="Facet API",
        version=API_VERSION,
        lifespan=lifespan,
        docs_url="/v1/docs" if settings.dev else None,
        redoc_url=None,
        openapi_url="/v1/openapi.json" if settings.dev else None,
    )
    app.state.settings = settings
    app.state.sessions = sessions
    app.state.storage = storage
    app.state.queue = jobs
    app.state.limiter = RateLimiter()

    def same_origin(request: Request, origin: str) -> bool:
        """True when the Origin is the site the browser addressed (directly or via the web proxy)."""
        host = urlsplit(origin).netloc
        forwarded = request.headers.get("x-forwarded-host", "").split(",")[0].strip()
        return bool(host) and host in (forwarded, request.headers.get("host", ""))

    @app.middleware("http")
    async def origin_guard(request: Request, call_next):
        # Cookies are SameSite=Lax; this also rejects cross-site writes from older browsers.
        origin = request.headers.get("origin")
        if (
            request.method in UNSAFE
            and origin
            and origin not in settings.web_origins
            and not same_origin(request, origin)
        ):
            return JSONResponse({"detail": "Cross-site requests are not allowed."}, status_code=403)
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        return response

    @app.get("/v1/health", response_model=Health)
    def health(db: Session = Depends(get_db), current: Settings = Depends(get_settings)) -> Health:
        return Health(status="ok", version=API_VERSION, env=current.env, overdue_images=overdue_images(db))

    app.include_router(auth.router)
    app.include_router(scans.router)
    app.include_router(reports.router)
    return app
