"""Turns typed securities into canonical instruments.

Resolution order: user alias, exact display match, ticker plus namespace, then search.
More than one match is returned as a list; the UI numbers them for picking.
"""

from __future__ import annotations

from pydantic import BaseModel

from almanac.core.grammar import SECTOR_ALIASES, SECTORS
from almanac.core.models import Instrument
from almanac.core.symbols import SymbolMaster

# Sector words recognized by the grammar but with no data source configured yet.
NO_SOURCE_SECTORS = {"MUNI", "PFD", "MTGE", "MMKT", "CORP"}


class Resolution(BaseModel):
    query: str
    exact: Instrument | None = None
    matches: list[Instrument] = []
    message: str | None = None


def resolve(master: SymbolMaster, q: str) -> Resolution:
    text = " ".join(q.upper().split())
    if not text:
        return Resolution(query=q)
    tokens = text.split(" ")
    sector = SECTOR_ALIASES.get(tokens[-1], tokens[-1]) if len(tokens) > 1 else None

    if sector in SECTORS:
        sec_tokens = tokens[:-1]
        if sector in NO_SOURCE_SECTORS:
            return Resolution(
                query=q,
                message=f"{sector} securities are recognized, but no source is "
                "configured for them yet.",
            )
        display = " ".join([*sec_tokens, sector])
        if inst := master.by_display(display):
            return Resolution(query=q, exact=inst, matches=[inst])
        # A country in GOVT names its curve: "US GOVT" -> the US par curve.
        is_country = sector == "GOVT" and len(sec_tokens) == 1 and len(sec_tokens[0]) == 2
        if is_country and (inst := master.by_display(f"{sec_tokens[0]} CURV")):
            return Resolution(query=q, exact=inst, matches=[inst])
        ticker = sec_tokens[0]
        hits = master.by_symbol(ticker, sector)
        if len(sec_tokens) > 1:
            ns = sec_tokens[1]
            hits = [
                h
                for h in hits
                if h.display.split(" ")[1:2] == [ns] or h.country == ns or h.mic == ns
            ] or hits
        if len(hits) == 1:
            return Resolution(query=q, exact=hits[0], matches=hits)
        if hits:
            return Resolution(query=q, matches=hits)
        found = master.search(" ".join(sec_tokens), sector)
        return Resolution(
            query=q,
            matches=found,
            message=None if found else f"No {sector} instrument matches {' '.join(sec_tokens)}.",
        )

    found = master.search(text)
    return Resolution(query=q, matches=found, message=None if found else "No matches.")
