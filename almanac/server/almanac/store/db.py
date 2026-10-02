"""SQLite access: numbered migrations applied at start-up after a backup of almanac.db."""

from __future__ import annotations

import json
import shutil
import sqlite3
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

MIGRATIONS = Path(__file__).parent / "migrations"
HISTORY_LIMIT = 50


class Store:
    def __init__(self, path: Path | str):
        self.path = str(path)
        self._lock = threading.Lock()
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self._migrate()

    # -- migrations --------------------------------------------------------------------------

    def _migrate(self) -> None:
        cur = self.conn.execute("PRAGMA user_version").fetchone()[0]
        pending = sorted((int(p.name.split("_")[0]), p) for p in MIGRATIONS.glob("*.sql"))
        pending = [(n, p) for n, p in pending if n > cur]
        if not pending:
            return
        if cur > 0 and self.path != ":memory:":
            shutil.copyfile(self.path, f"{self.path}.bak-v{cur}")
        for n, p in pending:
            with self.conn:
                self.conn.executescript(p.read_text())
                self.conn.execute(f"PRAGMA user_version = {n}")

    # -- state -------------------------------------------------------------------------------

    def get_state(self, kind: str) -> dict[str, Any]:
        rows = self.conn.execute(
            "SELECT key, value FROM state WHERE kind = ? ORDER BY key", (kind,)
        ).fetchall()
        return {r["key"]: json.loads(r["value"]) for r in rows}

    def put_state(self, kind: str, key: str, value: Any) -> None:
        with self._lock, self.conn:
            self.conn.execute(
                "INSERT INTO state (kind, key, value, updated_at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT (kind, key) DO UPDATE SET value = excluded.value, "
                "updated_at = excluded.updated_at",
                (kind, key, json.dumps(value), datetime.now(UTC).isoformat()),
            )

    def delete_state(self, kind: str, key: str) -> None:
        with self._lock, self.conn:
            self.conn.execute("DELETE FROM state WHERE kind = ? AND key = ?", (kind, key))

    # -- command history ---------------------------------------------------------------------

    def add_history(self, panel: str, command: str) -> None:
        with self._lock, self.conn:
            self.conn.execute(
                "INSERT INTO history (ts, panel, command) VALUES (?, ?, ?)",
                (datetime.now(UTC).isoformat(), panel, command),
            )
            self.conn.execute(
                "DELETE FROM history WHERE seq NOT IN "
                "(SELECT seq FROM history ORDER BY seq DESC LIMIT 500)"
            )

    def history(self, limit: int = HISTORY_LIMIT) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT ts, panel, command FROM history ORDER BY seq DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]
