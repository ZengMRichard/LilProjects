"""Symmetry index (spec section 4).

S = 1 - (1/n) * sum_i |p_i - M(p_i')| / IPD over mirrored landmark pairs (i, i'), where M
reflects across the facial midline. The midline is the fitted mid-sagittal plane (x = 0 after
frontalisation), and distances are already in IPD units.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from facet_metrics.canonical import SYMMETRY_REGIONS, canonical
from facet_metrics.geometry import Frontal


@dataclass(frozen=True)
class PairDeviation:
    right: int
    left: int
    region: str
    deviation: float  # |p_r - M(p_l)| in IPD units


@dataclass(frozen=True)
class SymmetryResult:
    overall: float
    regions: dict[str, float]  # region -> index
    pairs: tuple[PairDeviation, ...]


def pair_deviations(front: Frontal) -> tuple[PairDeviation, ...]:
    out = []
    for right, left, region in canonical().pairs:
        if region == "other":
            continue
        pr, pl = front.points[right], front.points[left]
        out.append(PairDeviation(right, left, region, math.hypot(pr[0] + pl[0], pr[1] - pl[1])))
    return tuple(out)


def symmetry(front: Frontal) -> SymmetryResult:
    pairs = pair_deviations(front)
    regions: dict[str, float] = {}
    for key, _label in SYMMETRY_REGIONS:
        members = [p.deviation for p in pairs if p.region == key]
        regions[key] = 1.0 - sum(members) / len(members)
    overall = 1.0 - sum(p.deviation for p in pairs) / len(pairs)
    return SymmetryResult(overall, regions, pairs)


def symmetry_overall(front: Frontal) -> float:
    return symmetry(front).overall
