"""Signed, expiring tokens and one-way hashing for session and magic-link tokens."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time


def new_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(10)}"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sign(secret: bytes, kind: str, subject: str, ttl_seconds: int, **extra: str) -> str:
    """A URL-safe token binding a kind ("upload", "object", "render") to a subject until expiry."""
    payload = _b64(json.dumps({"k": kind, "s": subject, "e": int(time.time()) + ttl_seconds, **extra}).encode())
    mac = _b64(hmac.new(secret, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{mac}"


def verify(secret: bytes, token: str, kind: str) -> dict | None:
    """The token's payload if the signature, kind and expiry all hold; otherwise None."""
    try:
        payload, mac = token.split(".", 1)
        expected = _b64(hmac.new(secret, payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(mac, expected):
            return None
        data = json.loads(_unb64(payload))
    except (ValueError, json.JSONDecodeError):
        return None
    if data.get("k") != kind or int(data.get("e", 0)) < time.time():
        return None
    return data
