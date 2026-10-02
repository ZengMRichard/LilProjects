"""Demo provider: offline, synthetic prices from a seeded random walk.

Commercial price data cannot be redistributed, so every price here is generated. Paths are
deterministic per instrument: the same request always returns the same bars. Each instrument
walks in 5-minute steps; daily bars are aggregated from those steps, so intraday and daily
views agree. Every value is tagged provider="demo" and the UI shows a DEMO badge.
"""

from __future__ import annotations

import hashlib
import math
import random
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, time, timedelta
from functools import lru_cache
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np

from almanac.core.models import (
    AssetClass,
    Instrument,
    Point,
    Provenance,
    Quote,
    Series,
    Table,
    Value,
)
from almanac.providers.base import NotSupported, ProviderHealth, RateLimits

ATTRIBUTION = "Synthetic demo data, not market prices"
END = date(2027, 12, 31)
NY = ZoneInfo("America/New_York")

# Session shape per asset class: (steps per day, local open, timezone, weekdays only)
SESSIONS: dict[str, tuple[int, time, ZoneInfo | None, bool]] = {
    "EQUITY": (78, time(9, 30), NY, True),
    "INDEX": (78, time(9, 30), NY, True),
    "GOVT": (96, time(0, 0), None, True),
    "CMDTY": (96, time(0, 0), None, True),
    "CURNCY": (288, time(0, 0), None, True),
    "CRYPTO": (288, time(0, 0), None, False),
}
STEP_MINUTES = {78: 5, 96: 15, 288: 5}
WIGGLE = 0.3  # how far a step's high and low reach beyond its open and close, in step sigmas


def _seed(id: str, salt: str = "") -> int:
    return int.from_bytes(hashlib.sha256(f"{id}|{salt}".encode()).digest()[:8], "little")


class DemoPath:
    """Deterministic price path for one instrument: daily OHLCV plus on-demand intraday."""

    def __init__(self, rec: dict[str, Any]):
        self.id = rec["id"]
        self.cls = self.id.split(":")[0]
        self.steps, self.open_t, self.tz, self.weekdays = SESSIONS[self.cls]
        self.vol = float(rec.get("vol", 0.2))
        self.base_volume = rec.get("volume")
        self.anchor = float(rec["anchor"])
        anchor_date = date.fromisoformat(rec["anchor_date"])
        since = date.fromisoformat(rec.get("since", "2000-01-03"))

        days = np.arange(np.datetime64(since), np.datetime64(END + timedelta(days=1)))
        if self.weekdays:
            days = days[np.is_busday(days)]
        self.days = days
        n = len(days)
        per_year = 252 if self.weekdays else 365
        sigma_d = self.vol / math.sqrt(per_year)
        self.sigma_step = sigma_d / math.sqrt(self.steps)
        # Yields mean-revert so they stay plausible over decades; prices drift up gently.
        self.kappa = 0.004 if self.cls == "GOVT" else 0.0
        self.mu = 0.0 if self.cls in ("GOVT", "CURNCY") else 0.06 / per_year
        self.gap_sigma = sigma_d * 0.25 if self.steps == 78 else 0.0

        rng = np.random.default_rng(_seed(self.id))
        gaps = rng.standard_normal(n) * self.gap_sigma
        z = self._steps()
        ramp = np.arange(1, self.steps + 1) / self.steps
        row_sum = z.sum(axis=1)
        drift = np.empty(n)
        close = np.empty(n)
        if self.kappa:
            level = 0.0
            for d in range(n):
                drift[d] = self.mu - self.kappa * level
                level = level + gaps[d] + row_sum[d] + drift[d]
                close[d] = level
        else:
            drift[:] = self.mu
            close = np.cumsum(gaps + row_sum + drift)
        open_ = np.concatenate([[0.0], close[:-1]]) + gaps
        path = open_[:, None] + np.cumsum(z, axis=1) + drift[:, None] * ramp
        prev = np.concatenate([open_[:, None], path[:, :-1]], axis=1)
        wig = np.abs(z) * WIGGLE
        high = (np.maximum(prev, path) + wig).max(axis=1)
        low = (np.minimum(prev, path) - wig).min(axis=1)
        del z, path, prev, wig
        # Shift so the close on the anchor date equals the anchor price.
        idx = int(np.searchsorted(days, np.datetime64(anchor_date)))
        idx = min(max(idx, 0), n - 1)
        shift = math.log(self.anchor) - close[idx]
        self.drift = drift
        self.log_open = open_ + shift
        self.o, self.h, self.l, self.c = (np.exp(x + shift) for x in (open_, high, low, close))
        if self.base_volume:
            vrng = np.random.default_rng(_seed(self.id, "volume"))
            rets = np.abs(np.diff(np.concatenate([[close[0]], close])))
            noise = np.exp(vrng.standard_normal(n) * 0.35)
            self.v = np.round(self.base_volume * noise * (1 + 3 * rets / sigma_d) / 2.5)
        else:
            self.v = None
        self._intraday_cache: dict[int, list] = {}

    def _steps(self) -> np.ndarray:
        """Every step's log return, one row per day. Regenerated on demand, never stored."""
        rng = np.random.default_rng(_seed(self.id, "steps"))
        return rng.standard_normal((len(self.days), self.steps)) * self.sigma_step

    def session_start(self, d: int) -> datetime:
        day = self.days[d].astype(object)
        tz = self.tz or UTC
        return datetime.combine(day, self.open_t, tzinfo=tz).astimezone(UTC)

    def session_end(self, d: int) -> datetime:
        return self.session_start(d) + timedelta(minutes=self.steps * self.step_minutes)

    @property
    def step_minutes(self) -> int:
        return STEP_MINUTES[self.steps]

    def last_index(self, now: datetime) -> int:
        """Index of the latest day whose session has started."""
        today = np.datetime64(now.astimezone(self.tz or UTC).date())
        d = int(np.searchsorted(self.days, today, side="right")) - 1
        while d >= 0 and self.session_start(d) > now:
            d -= 1
        return d

    def intraday(self, d: int) -> list[tuple[datetime, float, float, float, float, float | None]]:
        """5- or 15-minute steps for day d as (ts, open, high, low, close, volume)."""
        if d not in self._intraday_cache:
            if len(self._intraday_cache) > 16:
                self._intraday_cache.clear()
            z = self._steps()
            for k in range(max(0, d - 6), min(len(self.days), d + 2)):
                self._intraday_cache[k] = self._intraday_row(k, z[k])
        return self._intraday_cache[d]

    def _intraday_row(self, d: int, row: np.ndarray):
        ramp = np.arange(1, self.steps + 1) / self.steps
        path = self.log_open[d] + np.cumsum(row) + self.drift[d] * ramp
        prev = np.concatenate([[self.log_open[d]], path[:-1]])
        start = self.session_start(d)
        out = []
        weights = 1 + 1.5 * ((np.arange(self.steps) / self.steps - 0.5) * 2) ** 2
        weights = weights / weights.sum()
        for k in range(self.steps):
            a, b = math.exp(prev[k]), math.exp(path[k])
            wig = abs(row[k]) * WIGGLE
            vol = float(round(self.v[d] * weights[k])) if self.v is not None else None
            out.append(
                (
                    start + timedelta(minutes=k * self.step_minutes),
                    a,
                    math.exp(max(prev[k], path[k]) + wig),
                    math.exp(min(prev[k], path[k]) - wig),
                    b,
                    vol,
                )
            )
        return out

    def price_at(self, now: datetime) -> tuple[float, float, datetime]:
        """(last, previous close, as_of) at a moment in time."""
        d = self.last_index(now)
        if d < 0:
            return float("nan"), float("nan"), now
        prev_close = float(self.c[d - 1]) if d > 0 else float(self.o[d])
        if now >= self.session_end(d):
            return float(self.c[d]), prev_close, self.session_end(d)
        bars = [b for b in self.intraday(d) if b[0] <= now]
        last = bars[-1][4] if bars else float(self.o[d])
        return last, prev_close, now


@lru_cache(maxsize=64)
def _path(rec_key: str, rec_json: str) -> DemoPath:
    import json

    return DemoPath(json.loads(rec_json))


class DemoProvider:
    name = "demo"
    title = "Almanac demo dataset"
    terms_url = "https://www.apache.org/licenses/LICENSE-2.0"
    attribution = ATTRIBUTION
    requires_key = False
    limits = RateLimits()
    field_map: dict[str, str] = {}
    hosts: list[str] = []

    PRICED = ("EQUITY", "INDEX", "GOVT", "CMDTY", "CURNCY", "CRYPTO")
    capabilities = frozenset(
        [f"reference:{c}" for c in (*PRICED, "ECON", "CURVE")]
        + [f"history:{c}" for c in PRICED]
        + [f"stream:{c}" for c in PRICED]
        + ["bulk:EQUITY:filings"]
    )

    def __init__(self, instruments: list[Instrument], raw: dict[str, dict[str, Any]], clock=None):
        self.instruments = {i.id: i for i in instruments}
        self.raw = raw
        self.clock = clock or (lambda: datetime.now(UTC))
        self._live: dict[str, dict[str, float]] = {}

    # -- helpers ---------------------------------------------------------------------------

    def _prov(self, as_of: datetime | None = None) -> Provenance:
        return Provenance(
            provider="demo",
            fetched_at=self.clock(),
            as_of=as_of,
            delay_minutes=None,
            adjusted=True,
            attribution=ATTRIBUTION,
        )

    def path(self, id: str) -> DemoPath:
        import json

        rec = self.raw.get(id)
        if not rec or "anchor" not in rec:
            raise NotSupported(f"No demo prices for {id}")
        return _path(id, json.dumps(rec, sort_keys=True))

    # -- interface -------------------------------------------------------------------------

    async def search(self, text: str, asset_class: AssetClass | None) -> list[Instrument]:
        t = text.upper()
        return [
            i
            for i in self.instruments.values()
            if (asset_class is None or i.asset_class == asset_class)
            and (t in i.symbol.upper() or t in i.name.upper())
        ]

    async def reference(self, ids: list[str], fields: list[str]) -> dict[str, list[Value]]:
        out: dict[str, list[Value]] = {}
        for id in ids:
            inst = self.instruments.get(id)
            rec = self.raw.get(id, {})
            if not inst:
                continue
            vals: list[Value] = []
            price: tuple[float, float, datetime] | None = None
            for f in fields:
                v: Any = None
                unit = None
                as_of = None
                if f in ("px.last", "px.prev_close", "px.volume"):
                    if "anchor" not in rec:
                        continue
                    if price is None:
                        price = self._last(id)
                    last, prev, as_of = price
                    unit = rec.get("unit") or inst.currency
                    if f == "px.last":
                        v = last
                    elif f == "px.prev_close":
                        v = prev
                    else:
                        p = self.path(id)
                        d = p.last_index(self.clock())
                        v = float(p.v[d]) if p.v is not None and d >= 0 else None
                        unit = "shares"
                        if v is None:
                            continue
                elif f == "ref.name":
                    v = inst.name
                elif f == "ref.currency":
                    v = inst.currency
                elif f == "ref.country":
                    v = inst.country
                elif f == "ref.mic":
                    v = inst.mic
                elif f == "ref.cik":
                    v = rec.get("cik")
                elif f == "ref.sic":
                    v = rec.get("sic")
                elif f == "ref.industry":
                    v = rec.get("industry")
                elif f == "ref.description":
                    v = rec.get("description")
                elif f == "fin.shares_out":
                    v, unit = rec.get("shares_out"), "shares"
                elif f == "fin.eps_ttm":
                    v, unit = rec.get("eps_ttm"), inst.currency
                elif f == "fin.dps_ttm":
                    v, unit = rec.get("dps_ttm"), inst.currency
                if v is None:
                    continue  # not supplied: the router reports it as unavailable
                vals.append(Value(field=f, value=v, unit=unit, prov=self._prov(as_of)))
            out[id] = vals
        return out

    def _last(self, id: str) -> tuple[float, float, datetime]:
        p = self.path(id)
        last, prev, as_of = p.price_at(self.clock())
        live = self._live.get(id)
        if live:
            return live["last"], prev, self.clock()
        return last, prev, as_of

    async def history(
        self,
        id: str,
        fields: list[str],
        start: date,
        end: date,
        freq: str,
        adjusted: bool = True,
    ) -> list[Series]:
        p = self.path(id)
        inst = self.instruments[id]
        now = self.clock()
        rows: list[tuple[datetime, float, float, float, float, float | None]] = []
        if freq in ("5m", "15m", "1h", "1m"):
            lo = int(np.searchsorted(p.days, np.datetime64(start)))
            hi = int(np.searchsorted(p.days, np.datetime64(end), side="right"))
            for d in range(lo, min(hi, p.last_index(now) + 1)):
                rows += [b for b in p.intraday(d) if b[0] <= now]
            rows = _aggregate_intraday(rows, freq, p.step_minutes)
        else:
            last = p.last_index(now)
            lo = int(np.searchsorted(p.days, np.datetime64(start)))
            hi = min(int(np.searchsorted(p.days, np.datetime64(end), side="right")), last + 1)
            for d in range(lo, hi):
                ts = datetime.combine(p.days[d].astype(object), time(0), tzinfo=UTC)
                if d == last and now < p.session_end(d):
                    bars = [b for b in p.intraday(d) if b[0] <= now]
                    if not bars:
                        continue
                    vol = sum(b[5] or 0 for b in bars) if p.v is not None else None
                    rows.append(
                        (
                            ts,
                            bars[0][1],
                            max(b[2] for b in bars),
                            min(b[3] for b in bars),
                            bars[-1][4],
                            vol,
                        )
                    )
                else:
                    vol = float(p.v[d]) if p.v is not None else None
                    rows.append(
                        (ts, float(p.o[d]), float(p.h[d]), float(p.l[d]), float(p.c[d]), vol)
                    )
            if freq != "1d":
                from almanac.analytics.resample import resample_bars

                rows = resample_bars(rows, freq)
        prov = self._prov(rows[-1][0] if rows else None)
        col = {"px.open": 1, "px.high": 2, "px.low": 3, "px.close": 4, "px.last": 4, "px.volume": 5}
        out = []
        for f in fields:
            if f not in col:
                raise NotSupported(f"demo history has no {f}")
            if f == "px.volume" and p.v is None:
                continue
            k = col[f]
            out.append(
                Series(
                    instrument_id=id,
                    field=f,
                    freq=freq,  # type: ignore[arg-type]
                    currency=inst.currency,
                    prov=prov,
                    points=[Point(ts=r[0], value=r[k]) for r in rows],  # type: ignore[arg-type]
                )
            )
        return out

    async def bulk(self, id: str, field: str, params: dict[str, str]) -> Table:
        if field != "bulk.filings":
            raise NotSupported(field)
        rec = self.raw.get(id, {})
        if not rec.get("cik"):
            raise NotSupported(f"{id} is not an SEC filer in the demo set")
        rows = demo_filings(id, rec["cik"], int(rec.get("fy_end", 12)), self.clock().date())
        forms = {f.strip().upper() for f in params.get("form", "").split(",") if f.strip()}
        if forms:
            rows = [r for r in rows if r["form"].upper() in forms]
        limit = int(params.get("limit", "0") or 0)
        if limit:
            rows = rows[:limit]
        return Table(
            field=field,
            columns=["filed", "form", "period", "description", "url"],
            rows=rows,
            prov=self._prov(),
        )

    async def stream(self, ids: list[str], fields: list[str]) -> AsyncIterator[Quote]:
        raise NotSupported("use tick()")
        yield  # pragma: no cover

    def tick(self, id: str) -> Quote | None:
        """Advance the synthetic live quote one step and return it."""
        rec = self.raw.get(id)
        if not rec or "anchor" not in rec:
            return None
        p = self.path(id)
        now = self.clock()
        base, prev, _ = p.price_at(now)
        st = self._live.get(id)
        if st is None:
            st = {"last": base, "volume": 0.0}
            self._live[id] = st
        # Small steps that revert toward the generated path, so ticks stay near the bars.
        step = random.gauss(0, p.sigma_step * 0.6)
        st["last"] = st["last"] * math.exp(step) + (base - st["last"]) * 0.02
        st["volume"] += abs(step) * (p.base_volume or 0) * 0.02
        spread = st["last"] * (0.0004 if p.cls != "GOVT" else 0.002)
        last = st["last"]
        return Quote(
            instrument_id=id,
            ts=now,
            last=last,
            bid=last - spread / 2,
            ask=last + spread / 2,
            volume=float(p.v[p.last_index(now)]) + st["volume"] if p.v is not None else None,
            chg=last - prev,
            chg_pct=(last / prev - 1) * 100 if prev else None,
            prov=self._prov(now),
        )

    async def health(self) -> ProviderHealth:
        return ProviderHealth(ok=True, detail="offline demo data", checked_at=self.clock())


def _aggregate_intraday(rows, freq: str, step: int):
    want = {"1m": 1, "5m": 5, "15m": 15, "1h": 60}[freq]
    if want <= step:
        return rows
    k = want // step
    out = []
    for i in range(0, len(rows), k):
        chunk = rows[i : i + k]
        # never merge across sessions
        if chunk[-1][0] - chunk[0][0] > timedelta(minutes=want):
            chunk = [r for r in chunk if r[0].date() == chunk[0][0].date()]
        vol = sum(r[5] or 0 for r in chunk) if chunk[0][5] is not None else None
        out.append(
            (
                chunk[0][0],
                chunk[0][1],
                max(r[2] for r in chunk),
                min(r[3] for r in chunk),
                chunk[-1][4],
                vol,
            )
        )
    return out


EIGHT_K_ITEMS = {
    "2.02": "Results of Operations and Financial Condition",
    "5.02": "Departure or Election of Directors or Officers",
    "5.07": "Submission of Matters to a Vote of Security Holders",
    "7.01": "Regulation FD Disclosure",
    "8.01": "Other Events",
}


def demo_filings(id: str, cik: str, fy_end: int, today: date) -> list[dict[str, Any]]:
    """A plausible filing calendar for the demo: 10-K yearly, 10-Q quarterly, 8-Ks."""
    rng = random.Random(_seed(id, "filings"))
    url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=&dateb=&owner=include&count=40"
    rows: list[dict[str, Any]] = []
    for year in range(today.year - 6, today.year + 1):
        for q in range(4):
            m = (fy_end - 3 * (3 - q) - 1) % 12 + 1
            y = year if m <= fy_end else year - 1
            period_end = _month_end(y, m)
            is_annual = q == 3
            filed = period_end + timedelta(
                days=rng.randint(55, 70) if is_annual else rng.randint(30, 42)
            )
            if filed > today:
                continue
            form = "10-K" if is_annual else "10-Q"
            label = "Annual report" if is_annual else "Quarterly report"
            rows.append(
                {
                    "filed": filed.isoformat(),
                    "form": form,
                    "period": period_end.isoformat(),
                    "description": label,
                    "url": url,
                }
            )
            earn = filed - timedelta(days=rng.randint(1, 10))
            rows.append(
                {
                    "filed": earn.isoformat(),
                    "form": "8-K",
                    "period": earn.isoformat(),
                    "description": f"2.02 {EIGHT_K_ITEMS['2.02']}",
                    "url": url,
                }
            )
            if rng.random() < 0.5:
                item = rng.choice(["5.02", "5.07", "7.01", "8.01"])
                extra = period_end + timedelta(days=rng.randint(5, 80))
                if extra <= today:
                    rows.append(
                        {
                            "filed": extra.isoformat(),
                            "form": "8-K",
                            "period": extra.isoformat(),
                            "description": f"{item} {EIGHT_K_ITEMS[item]}",
                            "url": url,
                        }
                    )
    rows.sort(key=lambda r: r["filed"], reverse=True)
    return rows


def _month_end(y: int, m: int) -> date:
    nxt = date(y + (m == 12), m % 12 + 1, 1)
    return nxt - timedelta(days=1)
