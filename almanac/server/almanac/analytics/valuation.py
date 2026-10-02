"""Derived reference values. Pure functions; None in means None out, never zero."""

from __future__ import annotations

from collections.abc import Sequence


def mkt_cap(last: float | None, shares_out: float | None) -> float | None:
    if last is None or shares_out is None:
        return None
    return last * shares_out


def pe_ttm(last: float | None, eps_ttm: float | None) -> float | None:
    if last is None or eps_ttm is None or eps_ttm <= 0:
        return None  # a P/E on zero or negative earnings is not meaningful
    return last / eps_ttm


def div_yield_pct(dps_ttm: float | None, last: float | None) -> float | None:
    if dps_ttm is None or last is None or last <= 0:
        return None
    return dps_ttm / last * 100


def change(last: float | None, prev: float | None) -> tuple[float | None, float | None]:
    """(absolute change, percent change) from the previous close."""
    if last is None or prev is None:
        return None, None
    chg = last - prev
    return chg, (chg / prev * 100 if prev else None)


def hi_lo(closes: Sequence[float | None]) -> tuple[float | None, float | None]:
    xs = [c for c in closes if c is not None]
    if not xs:
        return None, None
    return max(xs), min(xs)
