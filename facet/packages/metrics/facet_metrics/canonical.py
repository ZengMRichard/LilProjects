"""The canonical face mesh and the landmark names the metrics use.

The mesh is MediaPipe's 468-vertex canonical face (478 with irises at run time). Clinical
soft-tissue landmarks are approximated by fixed mesh vertices; the trained clinical-landmark
model in the spec (section 7) replaces this table without touching the metric functions.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from importlib import resources

Vec = tuple[float, float, float]

MESH_VERTICES = 468
MESH_VERTICES_WITH_IRIS = 478


@dataclass(frozen=True)
class Canonical:
    vertices: tuple[Vec, ...]
    faces: tuple[tuple[int, int, int], ...]
    midline: tuple[int, ...]
    pairs: tuple[tuple[int, int, str], ...]  # (subject's right, subject's left, region)
    rigid: tuple[int, ...]
    zones: dict[str, tuple[int, ...]]


@cache
def canonical() -> Canonical:
    raw = json.loads(resources.files("facet_metrics").joinpath("data/canonical_face.json").read_text())
    return Canonical(
        vertices=tuple((v[0], v[1], v[2]) for v in raw["vertices"]),
        faces=tuple((f[0], f[1], f[2]) for f in raw["faces"]),
        midline=tuple(raw["midline"]),
        pairs=tuple((p[0], p[1], p[2]) for p in raw["pairs"]),
        rigid=tuple(raw["rigid"]),
        zones={name: tuple(members) for name, members in raw["zones"].items()},
    )


# Clinical landmark name -> mesh vertex. "_r" is the subject's right, "_l" the subject's left.
LANDMARKS: dict[str, int] = {
    "glabella": 9,
    "nasion": 168,
    "pronasale": 4,
    "columella": 94,
    "subnasale": 2,
    "labrale_superius": 0,
    "stomion_upper": 13,
    "stomion_lower": 14,
    "labrale_inferius": 17,
    "pogonion": 199,
    "menton": 152,
    "exocanthion_r": 33,
    "endocanthion_r": 133,
    "endocanthion_l": 362,
    "exocanthion_l": 263,
    "lid_upper_r": 159,
    "lid_lower_r": 145,
    "lid_upper_l": 386,
    "lid_lower_l": 374,
    "cheilion_r": 61,
    "cheilion_l": 291,
    "zygion_r": 234,
    "zygion_l": 454,
    "gonion_r": 172,
    "gonion_l": 397,
    "frontotemporale_r": 21,
    "frontotemporale_l": 251,
}

# The alar landmark is the most lateral of these vertices on each side (see geometry.alare).
ALAR_R = (129, 102, 48, 64)
ALAR_L = (358, 331, 278, 294)

# Iris centres exist only in the 478-point mesh; otherwise the eye-opening centroid stands in.
PUPIL_R = 468
PUPIL_L = 473
EYE_RING_R = (33, 133, 159, 145)
EYE_RING_L = (263, 362, 386, 374)

SYMMETRY_REGIONS: tuple[tuple[str, str], ...] = (
    ("brows", "Brows"),
    ("eyes", "Eyes"),
    ("nose", "Nose"),
    ("cheeks", "Cheeks"),
    ("mouth", "Mouth"),
    ("jaw", "Jaw and chin"),
)
