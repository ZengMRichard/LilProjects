"""Object storage for face images.

Production is S3 with SSE-KMS and per-region keys (spec section 8). Locally the same interface
is backed by the filesystem with AES-256-GCM, so images are never on disk in the clear.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Protocol

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_KEY = re.compile(r"^[A-Za-z0-9_\-/.]+$")


class Storage(Protocol):
    def put(self, key: str, data: bytes) -> None: ...
    def get(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None: ...
    def exists(self, key: str) -> bool: ...


class LocalEncryptedStorage:
    def __init__(self, root: Path, key: bytes) -> None:
        if len(key) != 32:
            raise ValueError("storage key must be 32 bytes")
        self._root = root
        self._aead = AESGCM(key)
        root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        if not _KEY.match(key) or ".." in key:
            raise ValueError("invalid storage key")
        return self._root / key

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        nonce = os.urandom(12)
        path.write_bytes(nonce + self._aead.encrypt(nonce, data, key.encode()))

    def get(self, key: str) -> bytes:
        blob = self._path(key).read_bytes()
        return self._aead.decrypt(blob[:12], blob[12:], key.encode())

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def exists(self, key: str) -> bool:
        return self._path(key).exists()
