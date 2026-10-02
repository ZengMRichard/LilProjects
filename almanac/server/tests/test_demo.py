from datetime import UTC, date, datetime

import numpy as np
import pytest

from almanac.config import DEMO_DIR
from almanac.core.symbols import load_demo_instruments
from almanac.providers.demo import DemoPath, DemoProvider, demo_filings

INSTRUMENTS, RAW = load_demo_instruments(DEMO_DIR / "instruments.json")
NOW = datetime(2026, 9, 30, 18, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    "id",
    ["EQUITY:US:AAPL", "CURNCY:FX:EURUSD", "GOVT:US:UST10Y", "CRYPTO:SPOT:BTCUSD", "CMDTY:EIA:WTI"],
)
def test_paths_are_deterministic_and_consistent(id):
    a, b = DemoPath(RAW[id]), DemoPath(RAW[id])
    assert np.array_equal(a.c, b.c) and np.array_equal(a.h, b.h)
    assert (a.l <= np.minimum(a.o, a.c)).all() and (a.h >= np.maximum(a.o, a.c)).all()
    assert (a.c > 0).all()
    anchor = date.fromisoformat(RAW[id]["anchor_date"])
    i = int(np.searchsorted(a.days, np.datetime64(anchor)))
    assert a.c[i] == pytest.approx(RAW[id]["anchor"])
    for d in (10, len(a.days) // 2, len(a.days) - 3):
        bars = a.intraday(d)
        assert bars[0][1] == pytest.approx(a.o[d])
        assert bars[-1][4] == pytest.approx(a.c[d])
        assert max(x[2] for x in bars) == pytest.approx(a.h[d])
        assert min(x[3] for x in bars) == pytest.approx(a.l[d])


def test_history_is_cut_at_the_clock():
    p = DemoProvider(INSTRUMENTS, RAW, clock=lambda: NOW)
    import asyncio

    s = asyncio.run(
        p.history("EQUITY:US:AAPL", ["px.close"], date(2026, 9, 1), date(2027, 1, 1), "1d")
    )
    assert s[0].points[-1].ts.date() == date(2026, 9, 30)
    assert all(pt.value is not None for pt in s[0].points)
    assert s[0].prov.provider == "demo" and s[0].prov.attribution


def test_ticks_stay_near_the_path():
    p = DemoProvider(INSTRUMENTS, RAW, clock=lambda: NOW)
    base = p.path("EQUITY:US:AAPL").price_at(NOW)[0]
    q = None
    for _ in range(500):
        q = p.tick("EQUITY:US:AAPL")
    assert q is not None and q.bid is not None and q.last is not None and q.ask is not None
    assert q.bid < q.last < q.ask
    assert abs(q.last / base - 1) < 0.05


def test_filings_calendar():
    rows = demo_filings("EQUITY:US:AAPL", "0000320193", 9, date(2026, 9, 30))
    tenk = [r for r in rows if r["form"] == "10-K"]
    # Apple-style September fiscal year: annual reports cover a September period end
    assert all(r["period"][5:7] == "09" for r in tenk)
    assert all(r["filed"] <= "2026-09-30" for r in rows)
    assert any(r["description"].startswith("2.02 Results of Operations") for r in rows)
