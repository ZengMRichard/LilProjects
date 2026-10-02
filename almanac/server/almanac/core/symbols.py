"""Symbol master: a local SQLite table with full-text search. Powers resolution offline."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from almanac.core.models import AssetClass, Instrument
from almanac.store.db import Store

# Short display codes for exchange namespaces; a composite country code displays as itself.
MIC_DISPLAY = {"XLON": "LN", "XNYS": "UN", "XNAS": "UW", "XTKS": "JT", "XETR": "GY"}


def display_for(asset_class: str, namespace: str, symbol: str, extra: dict[str, Any]) -> str:
    if asset_class == "EQUITY":
        ns = extra.get("display_ns") or MIC_DISPLAY.get(namespace, namespace)
        return f"{symbol} {ns} EQUITY"
    if asset_class == "CURVE":
        return f"{symbol} CURV"
    return f"{symbol} {asset_class}"


def load_demo_instruments(path: Path) -> tuple[list[Instrument], dict[str, dict[str, Any]]]:
    """Returns instruments plus the raw demo records keyed by id."""
    data = json.loads(path.read_text())
    out: list[Instrument] = []
    raw: dict[str, dict[str, Any]] = {}
    for rec in data["instruments"]:
        cls, ns, code = rec["id"].split(":", 2)
        ident: dict[str, str] = {}
        if rec.get("cik"):
            ident["cik"] = rec["cik"]
        out.append(
            Instrument(
                id=rec["id"],
                asset_class=AssetClass(cls),
                symbol=rec["symbol"],
                display=display_for(cls, ns, rec["symbol"], rec),
                name=rec["name"],
                currency=rec.get("currency"),
                mic=rec.get("mic"),
                country=rec.get("country"),
                identifiers=ident,
                provider_symbols={"demo": code},
            )
        )
        raw[rec["id"]] = rec | {"anchor_date": data["anchor_date"]}
    return out, raw


class SymbolMaster:
    def __init__(self, store: Store):
        self.store = store

    def seed(self, instruments: list[Instrument]) -> None:
        conn = self.store.conn
        with conn:
            for i in instruments:
                conn.execute("DELETE FROM symbols_fts WHERE id = ?", (i.id,))
                conn.execute(
                    "INSERT OR REPLACE INTO symbols VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (
                        i.id,
                        i.asset_class.value,
                        i.symbol,
                        i.display,
                        i.name,
                        i.currency,
                        i.mic,
                        i.country,
                        json.dumps(i.identifiers),
                        json.dumps(i.provider_symbols),
                    ),
                )
                conn.execute(
                    "INSERT INTO symbols_fts (id, symbol, display, name) VALUES (?,?,?,?)",
                    (i.id, i.symbol, i.display, i.name),
                )

    @staticmethod
    def _row(r) -> Instrument:
        return Instrument(
            id=r["id"],
            asset_class=AssetClass(r["asset_class"]),
            symbol=r["symbol"],
            display=r["display"],
            name=r["name"],
            currency=r["currency"],
            mic=r["mic"],
            country=r["country"],
            identifiers=json.loads(r["identifiers"]),
            provider_symbols=json.loads(r["provider_symbols"]),
        )

    def all(self) -> list[Instrument]:
        rows = self.store.conn.execute("SELECT * FROM symbols ORDER BY display").fetchall()
        return [self._row(r) for r in rows]

    def get(self, id: str) -> Instrument | None:
        r = self.store.conn.execute("SELECT * FROM symbols WHERE id = ?", (id,)).fetchone()
        return self._row(r) if r else None

    def by_display(self, display: str) -> Instrument | None:
        r = self.store.conn.execute(
            "SELECT * FROM symbols WHERE upper(display) = upper(?)", (display,)
        ).fetchone()
        return self._row(r) if r else None

    def by_symbol(self, symbol: str, asset_class: str | None = None) -> list[Instrument]:
        sql = "SELECT * FROM symbols WHERE upper(symbol) = upper(?)"
        args: list[Any] = [symbol]
        if asset_class:
            sql += " AND asset_class = ?"
            args.append(asset_class)
        return [self._row(r) for r in self.store.conn.execute(sql, args).fetchall()]

    def search(self, text: str, asset_class: str | None = None, limit: int = 20):
        terms = [t for t in re.split(r"[^\w]+", text) if t]
        if not terms:
            return []
        q = " ".join(f'"{t}"*' for t in terms)
        sql = (
            "SELECT s.* FROM symbols_fts f JOIN symbols s ON s.id = f.id WHERE symbols_fts MATCH ?"
        )
        args: list[Any] = [q]
        if asset_class:
            sql += " AND s.asset_class = ?"
            args.append(asset_class)
        sql += " ORDER BY (upper(s.symbol) = upper(?)) DESC, rank LIMIT ?"
        args += [text.strip(), limit]
        return [self._row(r) for r in self.store.conn.execute(sql, args).fetchall()]
