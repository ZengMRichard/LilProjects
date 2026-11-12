"""Request dependencies: database session, settings, storage and the signed-in user."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from collections.abc import Iterator

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from facet_api.config import Settings
from facet_api.db import AuthSession, User, aware, now
from facet_api.security import hash_token
from facet_api.storage import Storage

SESSION_COOKIE = "facet_session"


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_storage(request: Request) -> Storage:
    return request.app.state.storage


def get_db(request: Request) -> Iterator[Session]:
    with request.app.state.sessions() as db:
        yield db


def optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    session = db.get(AuthSession, hash_token(token))
    if session is None or (aware(session.expires_at) or now()) < now():
        return None
    return db.scalar(select(User).where(User.id == session.user_id))


def current_user(user: User | None = Depends(optional_user)) -> User:
    if user is None:
        raise HTTPException(401, "Sign in to continue.")
    return user


class RateLimiter:
    """Sliding-window limiter, in memory. Production uses Redis (spec section 5)."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window_seconds: float = 60.0) -> None:
        hits = self._hits[key]
        cutoff = time.monotonic() - window_seconds
        while hits and hits[0] < cutoff:
            hits.popleft()
        if len(hits) >= limit:
            raise HTTPException(429, "Too many image requests. Try again in a minute.")
        hits.append(time.monotonic())


def image_rate_limit(request: Request, user: User = Depends(current_user)) -> None:
    limiter: RateLimiter = request.app.state.limiter
    limiter.check(f"image:{user.id}", request.app.state.settings.image_requests_per_minute)
