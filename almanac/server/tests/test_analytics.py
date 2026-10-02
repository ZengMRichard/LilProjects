from datetime import UTC, date, datetime, timedelta

import pandas as pd
import pytest
from hypothesis import given
from hypothesis import strategies as st

from almanac.analytics import valuation
from almanac.analytics.resample import resample_bars, start_of_period


def test_mkt_cap_is_last_times_shares():
    assert valuation.mkt_cap(200.0, 15e9) == 3e12
    assert valuation.mkt_cap(None, 15e9) is None
    assert valuation.mkt_cap(200.0, None) is None


def test_pe_and_yield():
    assert valuation.pe_ttm(100, 5) == 20
    assert valuation.pe_ttm(100, 0) is None
    assert valuation.pe_ttm(100, -1) is None
    assert valuation.div_yield_pct(2, 100) == 2.0  # percent, not fraction
    assert valuation.change(110, 100) == (10, 10.0)
    assert valuation.change(None, 100) == (None, None)


@pytest.mark.parametrize(
    "period,end,expect",
    [
        ("1M", date(2026, 3, 31), date(2026, 2, 28)),
        ("3M", date(2026, 5, 15), date(2026, 2, 15)),
        ("1Y", date(2024, 2, 29), date(2023, 2, 28)),
        ("YTD", date(2026, 9, 30), date(2026, 1, 1)),
        ("5D", date(2026, 9, 30), date(2026, 9, 24)),
        ("1D", date(2026, 9, 30), date(2026, 9, 30)),
        ("1D", date(2026, 10, 4), date(2026, 10, 2)),  # Sunday rolls back to Friday
    ],
)
def test_start_of_period(period, end, expect):
    assert start_of_period(period, end) == expect


def _daily(n: int, seed: int = 1):
    import random

    r = random.Random(seed)
    rows = []
    d = datetime(2024, 1, 1, tzinfo=UTC)
    px = 100.0
    while len(rows) < n:
        if d.weekday() < 5:
            o = px
            c = px * (1 + r.gauss(0, 0.02))
            h = max(o, c) * 1.01
            low = min(o, c) * 0.99
            rows.append((d, o, h, low, c, float(r.randint(1000, 9000))))
            px = c
        d += timedelta(days=1)
    return rows


@pytest.mark.parametrize("freq,rule", [("1w", "W-SUN"), ("1mo", "ME")])
def test_resample_matches_pandas(freq, rule):
    rows = _daily(400)
    df = pd.DataFrame(rows, columns=["ts", "o", "h", "l", "c", "v"]).set_index("ts")
    ref = (
        df.resample(rule)
        .agg({"o": "first", "h": "max", "l": "min", "c": "last", "v": "sum"})
        .dropna()
    )
    got = resample_bars(rows, freq)
    assert len(got) == len(ref)
    for g, (_, r) in zip(got, ref.iterrows(), strict=True):
        assert g[1:] == pytest.approx((r.o, r.h, r.l, r.c, r.v))


@given(st.integers(min_value=1, max_value=300), st.sampled_from(["1w", "1mo", "1q", "1y"]))
def test_resample_invariants(n, freq):
    rows = _daily(n, seed=n)
    out = resample_bars(rows, freq)
    assert sum(r[5] or 0 for r in out) == pytest.approx(sum(r[5] or 0 for r in rows))
    assert all(r[3] <= min(r[1], r[4]) and r[2] >= max(r[1], r[4]) for r in out)
    assert out[-1][4] == rows[-1][4] and out[0][1] == rows[0][1]
