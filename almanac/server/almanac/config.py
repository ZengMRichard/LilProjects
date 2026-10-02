"""Settings from ~/.almanac/config.toml, overridden by ALMANAC_* environment variables."""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_PORT = 8765
REPO_ROOT = Path(__file__).resolve().parents[2]
DEMO_DIR = REPO_ROOT / "fixtures" / "demo"
WEB_DIST = REPO_ROOT / "apps" / "web" / "dist"


@dataclass
class Settings:
    home: Path
    port: int = DEFAULT_PORT
    mode: str = "demo"  # "live" or "demo"; Phase 0 ships only the demo provider
    clocks: list[str] = field(
        default_factory=lambda: ["America/New_York", "Europe/London", "Asia/Tokyo"]
    )
    priority: list[str] = field(default_factory=lambda: ["demo"])
    providers: dict[str, dict] = field(default_factory=dict)
    # Extra origins allowed to call the API, e.g. the Vite dev server.
    dev_origins: list[str] = field(default_factory=list)

    @property
    def db_path(self) -> Path:
        return self.home / "almanac.db"

    @property
    def allowed_hosts(self) -> set[str]:
        return {f"127.0.0.1:{self.port}", f"localhost:{self.port}"}

    @property
    def allowed_origins(self) -> set[str]:
        return {f"http://{h}" for h in self.allowed_hosts} | set(self.dev_origins)


def load(home: Path | None = None) -> Settings:
    home = Path(os.environ.get("ALMANAC_HOME") or home or Path.home() / ".almanac")
    home.mkdir(parents=True, exist_ok=True)
    s = Settings(home=home)

    cfg_path = home / "config.toml"
    if cfg_path.exists():
        cfg = tomllib.loads(cfg_path.read_text())
        server = cfg.get("server", {})
        data = cfg.get("data", {})
        s.port = int(server.get("port", s.port))
        s.clocks = list(server.get("clocks", s.clocks))
        s.mode = data.get("mode", s.mode)
        s.priority = list(data.get("priority", s.priority))
        s.providers = dict(cfg.get("providers", {}))

    if v := os.environ.get("ALMANAC_PORT"):
        s.port = int(v)
    if v := os.environ.get("ALMANAC_MODE"):
        s.mode = v
    if v := os.environ.get("ALMANAC_DEV_ORIGINS"):
        s.dev_origins = [o.strip() for o in v.split(",") if o.strip()]
    if s.mode not in ("live", "demo"):
        raise ValueError(f"mode must be 'live' or 'demo', not {s.mode!r}")
    return s
