"""Runs the metric set over a scan's landmark sets and attaches uncertainty.

Uncertainty (spec section 4, step 5): the landmark model is run on the captured frame and on
test-time augmentations of it. Each metric is computed on every landmark set; the spread across
them becomes the metric's 95% interval around the value from the un-augmented frame.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field

from facet_metrics.geometry import Frontal, Pose, frontalize
from facet_metrics.registry import METRICS, UNAVAILABLE, canthal_tilt_side
from facet_metrics.shape import FaceShape, classify_face_shape
from facet_metrics.symmetry import SymmetryResult, symmetry, symmetry_overall

LATERAL_VIEWS = ("left", "right")
Z95 = 1.96


@dataclass(frozen=True)
class ViewLandmarks:
    view: str  # front | left | right | three_quarter
    points: Sequence[Sequence[float]]  # image pixels, 468 or 478 landmarks
    augmented: Sequence[Sequence[Sequence[float]]] = ()


@dataclass(frozen=True)
class MetricValue:
    key: str
    value: float
    ci_low: float | None
    ci_high: float | None
    samples: int
    views: tuple[str, ...]


@dataclass(frozen=True)
class Unavailable:
    key: str
    reason: str


@dataclass(frozen=True)
class MetricsResult:
    values: dict[str, MetricValue]
    unavailable: list[Unavailable]
    poses: dict[str, Pose]
    symmetry: SymmetryResult | None
    face_shape: FaceShape | None
    figures: dict[str, object] = field(default_factory=dict)
    front: Frontal | None = None


def _interval(value: float, samples: Sequence[float]) -> tuple[float | None, float | None]:
    if len(samples) < 3:
        return None, None
    mean = sum(samples) / len(samples)
    sd = math.sqrt(sum((s - mean) ** 2 for s in samples) / (len(samples) - 1))
    return value - Z95 * sd, value + Z95 * sd


def _measure(
    key: str, fn: Callable[[Frontal], float], base: Frontal, augmented: Sequence[Frontal], views: tuple[str, ...]
) -> MetricValue:
    value = fn(base)
    samples = [value, *(fn(a) for a in augmented)]
    low, high = _interval(value, samples)
    return MetricValue(key, value, low, high, len(samples), views)


def _figures(front: Frontal) -> dict[str, object]:
    glabella, subnasale, menton = front.p("glabella")[1], front.p("subnasale")[1], front.p("menton")[1]
    middle, lower = glabella - subnasale, subnasale - menton
    xs = [
        front.p("zygion_r")[0],
        front.p("exocanthion_r")[0],
        front.p("endocanthion_r")[0],
        front.p("endocanthion_l")[0],
        front.p("exocanthion_l")[0],
        front.p("zygion_l")[0],
    ]
    width = xs[-1] - xs[0]
    return {
        "thirds": {"middle": middle / (middle + lower), "lower": lower / (middle + lower)},
        "fifths": [(b - a) / width for a, b in zip(xs, xs[1:], strict=False)],
        "canthal_tilt": {"right": canthal_tilt_side(front, "r"), "left": canthal_tilt_side(front, "l")},
    }


def compute_report_metrics(views: Mapping[str, ViewLandmarks]) -> MetricsResult:
    """Compute every metric the available views support. Requires a front view."""
    if "front" not in views:
        raise ValueError("a front view is required")
    frontal = {name: frontalize(v.points) for name, v in views.items()}
    augmented = {name: [frontalize(a) for a in v.augmented] for name, v in views.items()}
    front, front_aug = frontal["front"], augmented["front"]

    values: dict[str, MetricValue] = {}
    unavailable = [Unavailable(key, reason) for key, reason in UNAVAILABLE.items()]
    laterals = [name for name in LATERAL_VIEWS if name in views]

    for spec in METRICS:
        if spec.view == "front":
            values[spec.key] = _measure(spec.key, spec.fn, front, front_aug, ("front",))
            continue
        if not laterals:
            unavailable.append(Unavailable(spec.key, "This reading needs a turned view, and none was captured."))
            continue
        # Average the two sides; pair augmentation i of one side with augmentation i of the other.
        per_side = [_measure(spec.key, spec.fn, frontal[n], augmented[n], (n,)) for n in laterals]
        value = sum(m.value for m in per_side) / len(per_side)
        count = min(len(augmented[n]) for n in laterals)
        samples = [value] + [sum(spec.fn(augmented[n][i]) for n in laterals) / len(laterals) for i in range(count)]
        low, high = _interval(value, samples)
        values[spec.key] = MetricValue(spec.key, value, low, high, len(samples), tuple(laterals))

    values["symmetry.overall"] = _measure("symmetry.overall", symmetry_overall, front, front_aug, ("front",))

    return MetricsResult(
        values=values,
        unavailable=unavailable,
        poses={name: f.pose for name, f in frontal.items()},
        symmetry=symmetry(front),
        face_shape=classify_face_shape(front),
        figures=_figures(front),
        front=front,
    )
