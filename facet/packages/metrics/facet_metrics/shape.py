"""Face-shape class.

Face shape is a styling convention, not a measurement standard. This picks the nearest of six
conventional prototypes from three measured ratios, and names a runner-up when two are close.
The prototype values are provisional heuristics (docs/DECISIONS.md, D-007).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from facet_metrics.geometry import Frontal

# (length / cheek width, forehead width / cheek width, jaw width / cheek width)
PROTOTYPES: dict[str, tuple[float, float, float]] = {
    "oval": (0.95, 0.90, 0.74),
    "round": (0.85, 0.90, 0.79),
    "square": (0.87, 0.94, 0.85),
    "oblong": (1.05, 0.91, 0.78),
    "heart": (0.93, 0.96, 0.67),
    "diamond": (0.96, 0.82, 0.70),
}
# Rough spread of each ratio, used to put the three on a comparable scale.
SCALES = (0.07, 0.05, 0.06)
CLOSE_MARGIN = 0.35


@dataclass(frozen=True)
class FaceShape:
    label: str
    runner_up: str | None
    length_to_width: float
    forehead_to_cheek: float
    jaw_to_cheek: float


def shape_inputs(front: Frontal) -> tuple[float, float, float]:
    cheek = front.p("zygion_l")[0] - front.p("zygion_r")[0]
    length = front.p("glabella")[1] - front.p("menton")[1]
    forehead = front.p("frontotemporale_l")[0] - front.p("frontotemporale_r")[0]
    jaw = front.p("gonion_l")[0] - front.p("gonion_r")[0]
    return length / cheek, forehead / cheek, jaw / cheek


def classify_face_shape(front: Frontal) -> FaceShape:
    inputs = shape_inputs(front)
    ranked = sorted(
        (
            (math.sqrt(sum(((a - b) / s) ** 2 for a, b, s in zip(inputs, proto, SCALES, strict=True))), name)
            for name, proto in PROTOTYPES.items()
        ),
    )
    (best_distance, best), (second_distance, second) = ranked[0], ranked[1]
    runner_up = second if second_distance - best_distance < CLOSE_MARGIN else None
    return FaceShape(best, runner_up, *inputs)
