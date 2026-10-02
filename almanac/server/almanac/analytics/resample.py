"""Bar aggregation. Pure functions, no I/O."""

from __future__ import annotations

from datetime import date, datetime, timedelta

Row = tuple[datetime, float, float, float, float, float | None]


def _bucket(ts: datetime, freq: str) -> date:
    d = ts.date()
    if freq == "1w":
        return d - timedelta(days=d.weekday())  # week starting Monday
    if freq == "1mo":
        return d.replace(day=1)
    if freq == "1q":
        return d.replace(month=(d.month - 1) // 3 * 3 + 1, day=1)
    if freq == "1y":
        return d.replace(month=1, day=1)
    raise ValueError(f"unsupported freq {freq}")


def resample_bars(rows: list[Row], freq: str) -> list[Row]:
    """Aggregate daily bars to weekly, monthly, quarterly or yearly.

    Each output bar is stamped with the last trading day it contains, with open from the
    first bar, high and low from the extremes, close from the last bar, volume summed.
    """
    out: list[Row] = []
    cur_key: date | None = None
    group: list[Row] = []

    def flush():
        if not group:
            return
        vols = [g[5] for g in group]
        vol = None if any(v is None for v in vols) else float(sum(v for v in vols if v))
        out.append(
            (
                group[-1][0],
                group[0][1],
                max(g[2] for g in group),
                min(g[3] for g in group),
                group[-1][4],
                vol,
            )
        )

    for r in rows:
        k = _bucket(r[0], freq)
        if k != cur_key:
            flush()
            group = []
            cur_key = k
        group.append(r)
    flush()
    return out


def start_of_period(period: str, end: date) -> date:
    """Start date for a period code: 1D, 5D, 1M, 3M, 6M, YTD, 1Y, 5Y, 10Y, MAX."""
    p = period.upper()
    if p == "MAX":
        return date(1900, 1, 1)
    if p == "YTD":
        return date(end.year, 1, 1)
    n, unit = int(p[:-1]), p[-1]
    if unit == "D":
        # trading days: walk back over weekends
        d, left = end, n - 1
        while left > 0:
            d -= timedelta(days=1)
            if d.weekday() < 5:
                left -= 1
        while d.weekday() >= 5:
            d -= timedelta(days=1)
        return d
    if unit == "M":
        m = end.month - n
        y = end.year + (m - 1) // 12
        m = (m - 1) % 12 + 1
        return _clamp_day(y, m, end.day)
    if unit == "Y":
        return _clamp_day(end.year - n, end.month, end.day)
    raise ValueError(f"unknown period {period}")


def _clamp_day(y: int, m: int, d: int) -> date:
    while True:
        try:
            return date(y, m, d)
        except ValueError:
            d -= 1


# Frequency follows period: 1D uses 5-minute bars, 5D 15-minute, 1M to 1Y daily,
# 5Y and 10Y weekly, MAX monthly.
CHART_FREQ = {
    "1D": "5m",
    "5D": "15m",
    "1M": "1d",
    "3M": "1d",
    "6M": "1d",
    "YTD": "1d",
    "1Y": "1d",
    "5Y": "1w",
    "10Y": "1w",
    "MAX": "1mo",
}
PERIODS = list(CHART_FREQ)
