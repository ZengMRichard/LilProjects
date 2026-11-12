"""Settings, read once from the environment."""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path


def _key_file(path: Path, nbytes: int) -> bytes:
    """Load a local key, creating it on first run. Production injects keys from KMS instead."""
    if path.exists():
        return bytes.fromhex(path.read_text().strip())
    path.parent.mkdir(parents=True, exist_ok=True)
    key = secrets.token_bytes(nbytes)
    path.write_text(key.hex())
    path.chmod(0o600)
    return key


@dataclass(frozen=True)
class Settings:
    env: str = "dev"  # dev | prod
    data_dir: Path = Path(".data")
    db_url: str = ""
    web_origins: tuple[str, ...] = ("http://localhost:3000", "http://127.0.0.1:3000")
    web_url: str = "http://localhost:3000"
    public_api_url: str = "/"  # prefix for signed URLs handed to the browser (same origin via the web proxy)
    scan_min_interval_days: int = 14
    image_retention_days: int = 30
    abandoned_upload_hours: int = 24
    session_days: int = 30
    full_report_price_usd: int = 29
    upsell_pause_days: int = 30
    worker_inline: bool = False
    llm_narrative: bool = False
    llm_model: str = "claude-opus-5-5"
    chrome_path: str | None = None
    max_upload_bytes: int = 8 * 1024 * 1024
    image_requests_per_minute: int = 60
    secret: bytes = field(default=b"", repr=False)
    storage_key: bytes = field(default=b"", repr=False)

    @property
    def dev(self) -> bool:
        return self.env != "prod"


def _flag(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    return default if raw is None else raw.strip().lower() in ("1", "true", "yes", "on")


def load_settings() -> Settings:
    env = os.environ.get("FACET_ENV", "dev")
    data_dir = Path(os.environ.get("FACET_DATA_DIR", ".data")).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    secret_hex = os.environ.get("FACET_SECRET")
    storage_hex = os.environ.get("FACET_STORAGE_KEY")
    if env == "prod" and not (secret_hex and storage_hex):
        raise RuntimeError("FACET_SECRET and FACET_STORAGE_KEY must be set when FACET_ENV=prod")
    origins = os.environ.get("FACET_WEB_ORIGINS")
    web_url = os.environ.get("FACET_WEB_URL", "http://localhost:3000")
    # The 14-day rule applies in production. In development it is off unless set, so a
    # developer can scan repeatedly; the tests set it explicitly.
    interval = os.environ.get("FACET_SCAN_MIN_INTERVAL_DAYS")
    return Settings(
        env=env,
        data_dir=data_dir,
        db_url=os.environ.get("FACET_DB_URL", f"sqlite:///{data_dir / 'facet.db'}"),
        web_origins=tuple(o.strip() for o in origins.split(",")) if origins else (web_url, "http://127.0.0.1:3000"),
        web_url=web_url,
        scan_min_interval_days=int(interval) if interval is not None else (14 if env == "prod" else 0),
        image_retention_days=int(os.environ.get("FACET_IMAGE_RETENTION_DAYS", "30")),
        worker_inline=_flag("FACET_WORKER_INLINE"),
        llm_narrative=_flag("FACET_LLM_NARRATIVE"),
        llm_model=os.environ.get("FACET_LLM_MODEL", "claude-opus-5-5"),
        chrome_path=os.environ.get("FACET_CHROME_PATH"),
        secret=bytes.fromhex(secret_hex) if secret_hex else _key_file(data_dir / "keys" / "secret.key", 32),
        storage_key=bytes.fromhex(storage_hex) if storage_hex else _key_file(data_dir / "keys" / "storage.key", 32),
    )
