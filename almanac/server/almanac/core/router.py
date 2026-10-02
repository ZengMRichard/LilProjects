"""Provider router: picks a provider per request by capability and user priority, computes
derived fields, and stamps provenance. If nothing can answer, it returns Unavailable with
reasons; the UI shows a dash and a tooltip such as "No provider configured for px.bid".
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

from almanac.analytics import valuation
from almanac.analytics.resample import CHART_FREQ, start_of_period
from almanac.core import fields as F
from almanac.core.models import Instrument, Point, Series, Table, Unavailable, Value
from almanac.core.symbols import SymbolMaster
from almanac.providers.base import NotSupported, Provider


class Router:
    def __init__(
        self,
        providers: list[Provider],
        master: SymbolMaster,
        priority: list[str],
        clock: Callable[[], datetime] | None = None,
    ):
        rank = {name: i for i, name in enumerate(priority)}
        self.providers = sorted(providers, key=lambda p: rank.get(p.name, len(rank)))
        self.master = master
        self.clock = clock or (lambda: datetime.now(UTC))

    def today(self) -> date:
        return self.clock().date()

    # -- provider selection ------------------------------------------------------------------

    def candidates(self, capability: str) -> list[Provider]:
        return [p for p in self.providers if capability in p.capabilities]

    def _instrument(self, id: str) -> Instrument | None:
        return self.master.get(id)

    # -- reference ---------------------------------------------------------------------------

    async def reference(
        self, ids: list[str], fields: list[str]
    ) -> dict[str, dict[str, Value | Unavailable]]:
        out: dict[str, dict[str, Value | Unavailable]] = {}
        for id in ids:
            inst = self._instrument(id)
            if inst is None:
                out[id] = {
                    f: Unavailable(field=f, reasons=[f"Unknown instrument {id}"]) for f in fields
                }
                continue
            out[id] = await self._reference_one(inst, fields)
        return out

    async def _reference_one(
        self, inst: Instrument, fields: list[str]
    ) -> dict[str, Value | Unavailable]:
        result: dict[str, Value | Unavailable] = {}
        unknown = [f for f in fields if F.get(f) is None]
        for f in unknown:
            result[f] = Unavailable(field=f, reasons=[f"Unknown field {f}"])
        plain = [f for f in fields if F.get(f) and f not in F.COMPUTED_INPUTS]
        computed = [f for f in fields if f in F.COMPUTED_INPUTS]
        needed = set(plain)
        for f in computed:
            needed |= {i for i in F.COMPUTED_INPUTS[f] if not i.endswith("@history")}
        got = await self._fetch_reference(inst, sorted(needed))
        for f in plain:
            result[f] = got[f]
        for f in computed:
            result[f] = await self._compute(inst, f, got)
        return {f: result[f] for f in fields}

    async def _fetch_reference(
        self, inst: Instrument, fields: list[str]
    ) -> dict[str, Value | Unavailable]:
        cap = F.capability("", "reference", inst.asset_class.value)
        reasons: dict[str, list[str]] = {f: [] for f in fields}
        got: dict[str, Value | Unavailable] = {}
        missing = list(fields)
        providers = self.candidates(cap)
        for p in providers:
            if not missing:
                break
            try:
                vals = (await p.reference([inst.id], missing)).get(inst.id, [])
            except NotSupported as e:
                for f in missing:
                    reasons[f].append(f"{p.name}: {e}")
                continue
            except Exception as e:  # provider error: try the next and record why
                for f in missing:
                    reasons[f].append(f"{p.name} failed: {e}")
                continue
            for v in vals:
                if v.field in missing:
                    got[v.field] = v
            for f in missing:
                if f not in got:
                    reasons[f].append(f"{p.name} does not supply {f} for {inst.display}")
            missing = [f for f in missing if f not in got]
        for f in missing:
            if not providers:
                reasons[f].insert(0, f"No provider configured for {f} on {inst.asset_class.value}")
            got[f] = Unavailable(field=f, reasons=reasons[f] or [f"No provider supplies {f}"])
        return got

    async def _compute(
        self, inst: Instrument, f: str, got: dict[str, Value | Unavailable]
    ) -> Value | Unavailable:
        def val(name: str) -> float | None:
            v = got.get(name)
            return v.value if isinstance(v, Value) and isinstance(v.value, int | float) else None

        def why(*names: str) -> list[str]:
            r: list[str] = []
            for n in names:
                v = got.get(n)
                if isinstance(v, Unavailable):
                    r += [f"needs {n}: {x}" for x in v.reasons]
            return r or [f"inputs for {f} are missing"]

        base = next((v for v in got.values() if isinstance(v, Value)), None)
        inputs = F.COMPUTED_INPUTS[f]
        if f in ("px.hi_52w", "px.lo_52w"):
            end = self.today()
            series = await self.history(
                inst.id, ["px.high", "px.low"], end - timedelta(days=365), end, "1d"
            )
            if isinstance(series, Unavailable):
                return Unavailable(field=f, reasons=series.reasons)
            by = {s.field: s for s in series}
            hi, _ = valuation.hi_lo([p.value for p in by["px.high"].points])
            _, lo = valuation.hi_lo([p.value for p in by["px.low"].points])
            x = hi if f == "px.hi_52w" else lo
            if x is None:
                return Unavailable(field=f, reasons=["no history in the last 52 weeks"])
            prov = by["px.high"].prov
            return Value(field=f, value=x, unit=inst.currency, prov=prov)

        a, b = (val(i) for i in inputs)
        if f == "px.chg":
            x = valuation.change(a, b)[0]
            unit = inst.currency
        elif f == "px.chg_pct":
            x = valuation.change(a, b)[1]
            unit = "%"
        elif f == "val.mkt_cap":
            x = valuation.mkt_cap(a, b)
            unit = inst.currency
        elif f == "val.pe_ttm":
            x = valuation.pe_ttm(a, b)
            unit = "ratio"
        elif f == "val.div_yield":
            x = valuation.div_yield_pct(b, a)
            unit = "%"
        else:  # pragma: no cover
            raise KeyError(f)
        if x is None:
            reasons = why(*inputs)
            if f == "val.pe_ttm" and b is not None and b <= 0:
                reasons = ["trailing EPS is zero or negative"]
            return Unavailable(field=f, reasons=reasons)
        src = got.get(inputs[0])
        prov = src.prov if isinstance(src, Value) else base.prov  # type: ignore[union-attr]
        return Value(field=f, value=x, unit=unit, prov=prov)

    # -- history -----------------------------------------------------------------------------

    async def history(
        self,
        id: str,
        fields: list[str],
        start: date | None = None,
        end: date | None = None,
        freq: str | None = None,
        adjusted: bool = True,
        ccy: str | None = None,
        period: str | None = None,
    ) -> list[Series] | Unavailable:
        inst = self._instrument(id)
        if inst is None:
            return Unavailable(field=",".join(fields), reasons=[f"Unknown instrument {id}"])
        end = end or self.today()
        if period:
            start = start or start_of_period(period, end)
            freq = freq or CHART_FREQ.get(period.upper(), "1d")
        start = start or end - timedelta(days=365)
        freq = freq or "1d"
        cap = F.capability("", "history", inst.asset_class.value)
        providers = self.candidates(cap)
        if not providers:
            return Unavailable(
                field=",".join(fields),
                reasons=[f"No provider configured for history on {inst.asset_class.value}"],
            )
        reasons = []
        # Never mix providers inside one series: the first provider that answers wins.
        for p in providers:
            try:
                series = await p.history(id, fields, start, end, freq, adjusted)
            except NotSupported as e:
                reasons.append(f"{p.name}: {e}")
                continue
            except Exception as e:
                reasons.append(f"{p.name} failed: {e}")
                continue
            if not series or not any(s.points for s in series):
                reasons.append(f"{p.name} returned no data")
                continue
            if ccy and inst.currency and ccy.upper() != inst.currency.upper():
                return await self._convert(inst, series, ccy.upper(), start, end, adjusted)
            return series
        return Unavailable(field=",".join(fields), reasons=reasons)

    async def _convert(
        self,
        inst: Instrument,
        series: list[Series],
        ccy: str,
        start: date,
        end: date,
        adjusted: bool,
    ) -> list[Series] | Unavailable:
        src = (inst.currency or "").upper()
        scale = 1.0
        if inst.currency == "GBp":  # pence quotes convert to pounds first
            src, scale = "GBP", 0.01
        fx: dict[date, float] = {}
        if src != ccy:
            pair = self.master.get(f"CURNCY:FX:{src}{ccy}")
            inverse = False
            if pair is None:
                pair = self.master.get(f"CURNCY:FX:{ccy}{src}")
                inverse = True
            if pair is None:
                return Unavailable(field="ccy", reasons=[f"No FX pair to convert {src} to {ccy}"])
            fs = await self.history(
                pair.id, ["px.close"], start - timedelta(days=10), end, "1d", adjusted
            )
            if isinstance(fs, Unavailable):
                return Unavailable(field="ccy", reasons=fs.reasons)
            for pt in fs[0].points:
                if pt.value:
                    fx[pt.ts.date()] = 1 / pt.value if inverse else pt.value
        days = sorted(fx)
        out = []
        for s in series:
            if s.field == "px.volume":
                out.append(s)
                continue
            pts = []
            for pt in s.points:
                rate = 1.0
                if days:
                    rate = _asof(fx, days, pt.ts.date())
                v = None if pt.value is None or rate is None else pt.value * scale * rate
                pts.append(Point(ts=pt.ts, value=v))
            out.append(s.model_copy(update={"points": pts, "currency": ccy}))
        return out

    # -- bulk --------------------------------------------------------------------------------

    async def bulk(self, id: str, field: str, params: dict[str, Any]) -> Table | Unavailable:
        inst = self._instrument(id)
        if inst is None:
            return Unavailable(field=field, reasons=[f"Unknown instrument {id}"])
        cap = F.capability(field, "bulk", inst.asset_class.value)
        providers = self.candidates(cap)
        if not providers:
            return Unavailable(
                field=field,
                reasons=[f"No provider configured for {field} on {inst.asset_class.value}"],
            )
        reasons = []
        for p in providers:
            try:
                return await p.bulk(id, field, {k: str(v) for k, v in params.items()})
            except NotSupported as e:
                reasons.append(f"{p.name}: {e}")
            except Exception as e:
                reasons.append(f"{p.name} failed: {e}")
        return Unavailable(field=field, reasons=reasons)


def _asof(fx: dict[date, float], days: list[date], d: date) -> float | None:
    import bisect

    i = bisect.bisect_right(days, d) - 1
    return fx[days[i]] if i >= 0 else None
