"""Reference ranges and how a value is placed against them.

A value is reported as a band, never a pass or fail (spec section 4, step 6). Two kinds of
entry are supported:

* ``mean`` and ``sd`` from a cited study: the value gets one of five percentile bands.
* ``low`` and ``high`` only: the value is below, within or above the typical range. This is all
  the provisional set supports, because inventing percentiles for uncited ranges would be false
  precision.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import cache
from importlib import resources

DEFAULT_GROUP = "pooled_adult"

PERCENTILE_BANDS: tuple[tuple[float, str], ...] = (
    (0.10, "p0_10"),
    (0.25, "p10_25"),
    (0.75, "p25_75"),
    (0.90, "p75_90"),
    (1.00, "p90_100"),
)
# The central 80% of a normal distribution spans mean +/- 1.2816 sd.
Z80 = 1.2816


@dataclass(frozen=True)
class NormEntry:
    low: float
    high: float
    mean: float | None = None
    sd: float | None = None


@dataclass(frozen=True)
class ReferenceGroup:
    key: str
    label: str
    description: str
    source: str | None
    sample: str | None
    era: str | None
    metrics: dict[str, NormEntry]


@dataclass(frozen=True)
class NormSet:
    version: str
    status: str  # provisional | validated
    note: str
    groups: dict[str, ReferenceGroup]

    @property
    def provisional(self) -> bool:
        return self.status != "validated"

    def group(self, key: str | None) -> ReferenceGroup:
        return self.groups.get(key or DEFAULT_GROUP) or self.groups[DEFAULT_GROUP]


@dataclass(frozen=True)
class Placement:
    band: str  # below_typical | typical | above_typical | p0_10 ... p90_100
    low: float
    high: float
    percentile: float | None


def _entry(raw: dict[str, float]) -> NormEntry:
    if "mean" in raw and "sd" in raw:
        mean, sd = float(raw["mean"]), float(raw["sd"])
        if sd <= 0:
            raise ValueError("sd must be positive")
        return NormEntry(mean - Z80 * sd, mean + Z80 * sd, mean, sd)
    low, high = float(raw["low"]), float(raw["high"])
    if not low < high:
        raise ValueError("low must be below high")
    return NormEntry(low, high)


def parse_norms(raw: dict) -> NormSet:
    groups = {
        key: ReferenceGroup(
            key=key,
            label=g["label"],
            description=g.get("description", ""),
            source=g.get("source"),
            sample=g.get("sample"),
            era=g.get("era"),
            metrics={metric: _entry(entry) for metric, entry in g["metrics"].items()},
        )
        for key, g in raw["groups"].items()
    }
    if DEFAULT_GROUP not in groups:
        raise ValueError(f"norm set needs a {DEFAULT_GROUP!r} group")
    return NormSet(raw["version"], raw["status"], raw.get("note", ""), groups)


@cache
def load_norms() -> NormSet:
    text = resources.files("facet_norms").joinpath("data/provisional_v0.json").read_text()
    return parse_norms(json.loads(text))


def place(value: float, entry: NormEntry) -> Placement:
    """Place a value against a reference entry."""
    if entry.mean is not None and entry.sd is not None:
        percentile = 0.5 * (1.0 + math.erf((value - entry.mean) / (entry.sd * math.sqrt(2.0))))
        band = next(name for upper, name in PERCENTILE_BANDS if percentile <= upper)
        return Placement(band, entry.low, entry.high, percentile)
    if value < entry.low:
        band = "below_typical"
    elif value > entry.high:
        band = "above_typical"
    else:
        band = "typical"
    return Placement(band, entry.low, entry.high, None)


def band_side(band: str) -> str:
    """Collapse any band to below | typical | above for copy selection."""
    if band in ("below_typical", "p0_10"):
        return "below"
    if band in ("above_typical", "p90_100"):
        return "above"
    return "typical"
