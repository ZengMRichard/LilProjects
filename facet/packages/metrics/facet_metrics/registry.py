"""The MVP metric set (spec section 4): one pure function per metric.

Frontal metrics read the frontal plane (x, y) of a frontalised front view. Lateral metrics read
the sagittal plane (y, z) of a frontalised turned view; they depend on the mesh's depth estimate,
which smooths the nose and chin outline, so they are marked experimental and are never compared
with a reference range.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass

from facet_metrics.geometry import Frontal, angle_deg, dist_xy


@dataclass(frozen=True)
class MetricSpec:
    key: str
    region: str  # face | eyes | nose | lips | jaw | symmetry
    unit: str  # ratio | share | deg | ipd | index
    view: str  # front | lateral
    landmarks: tuple[str, ...]
    fn: Callable[[Frontal], float]
    experimental: bool = False
    reference: str = ""  # the documented definition this function implements


def _face_width(f: Frontal) -> float:
    return f.p("zygion_l")[0] - f.p("zygion_r")[0]


def _intercanthal(f: Frontal) -> float:
    return f.p("endocanthion_l")[0] - f.p("endocanthion_r")[0]


def _fissure_width(f: Frontal, side: str) -> float:
    return dist_xy(f.p(f"exocanthion_{side}"), f.p(f"endocanthion_{side}"))


def _alar_width(f: Frontal) -> float:
    return f.alare("l")[0] - f.alare("r")[0]


def thirds_middle_lower_ratio(f: Frontal) -> float:
    middle = f.p("glabella")[1] - f.p("subnasale")[1]
    lower = f.p("subnasale")[1] - f.p("menton")[1]
    return middle / lower


def fifths_intercanthal_share(f: Frontal) -> float:
    return _intercanthal(f) / _face_width(f)


def fifths_eye_width_share(f: Frontal) -> float:
    return (_fissure_width(f, "r") + _fissure_width(f, "l")) / 2 / _face_width(f)


def width_height_ratio(f: Frontal) -> float:
    return _face_width(f) / (f.p("nasion")[1] - f.p("menton")[1])


def canthal_tilt_side(f: Frontal, side: str) -> float:
    """Angle from the inner to the outer eye corner; positive when the outer corner is higher."""
    inner, outer = f.p(f"endocanthion_{side}"), f.p(f"exocanthion_{side}")
    return math.degrees(math.atan2(outer[1] - inner[1], abs(outer[0] - inner[0])))


def canthal_tilt(f: Frontal) -> float:
    return (canthal_tilt_side(f, "r") + canthal_tilt_side(f, "l")) / 2


def eye_spacing_ratio(f: Frontal) -> float:
    return _intercanthal(f) / ((_fissure_width(f, "r") + _fissure_width(f, "l")) / 2)


def palpebral_fissure_ratio(f: Frontal) -> float:
    def one(side: str) -> float:
        height = f.p(f"lid_upper_{side}")[1] - f.p(f"lid_lower_{side}")[1]
        return height / _fissure_width(f, side)

    return (one("r") + one("l")) / 2


def nasal_to_intercanthal(f: Frontal) -> float:
    return _alar_width(f) / _intercanthal(f)


def upper_lower_lip_ratio(f: Frontal) -> float:
    upper = f.p("labrale_superius")[1] - f.p("stomion_upper")[1]
    lower = f.p("stomion_lower")[1] - f.p("labrale_inferius")[1]
    return upper / lower


def mouth_to_nose_width(f: Frontal) -> float:
    return dist_xy(f.p("cheilion_r"), f.p("cheilion_l")) / _alar_width(f)


def philtrum_length(f: Frontal) -> float:
    return f.p("subnasale")[1] - f.p("labrale_superius")[1]


def bigonial_bizygomatic(f: Frontal) -> float:
    return (f.p("gonion_l")[0] - f.p("gonion_r")[0]) / _face_width(f)


def _sagittal(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float]:
    """Vector a -> b in the sagittal plane, as (forward, up)."""
    return (b[2] - a[2], b[1] - a[1])


def _camera_side(f: Frontal) -> str:
    # Turning toward the subject's left (yaw > 0) shows the camera the subject's right side.
    return "r" if f.pose.yaw > 0 else "l"


def nasofrontal_angle(f: Frontal) -> float:
    nasion = f.p("nasion")
    return angle_deg(_sagittal(nasion, f.p("glabella")), _sagittal(nasion, f.p("pronasale")))


def nasolabial_angle(f: Frontal) -> float:
    base = f.p("subnasale")
    return angle_deg(_sagittal(base, f.p("columella")), _sagittal(base, f.p("labrale_superius")))


def gonial_angle(f: Frontal) -> float:
    side = _camera_side(f)
    gonion = f.p(f"gonion_{side}")
    return angle_deg(_sagittal(gonion, f.p(f"zygion_{side}")), _sagittal(gonion, f.p("menton")))


def chin_projection(f: Frontal) -> float:
    """How far the chin point sits in front of (+) or behind (-) the nose base, in IPD units."""
    return f.p("pogonion")[2] - f.p("subnasale")[2]


METRICS: tuple[MetricSpec, ...] = (
    MetricSpec(
        "face.thirds.middle_lower_ratio", "face", "ratio", "front",
        ("glabella", "subnasale", "menton"), thirds_middle_lower_ratio,
        reference="(glabella to subnasale) / (subnasale to menton), vertical distances",
    ),
    MetricSpec(
        "face.fifths.intercanthal_share", "face", "share", "front",
        ("endocanthion_r", "endocanthion_l", "zygion_r", "zygion_l"), fifths_intercanthal_share,
        reference="intercanthal width / bizygomatic width",
    ),
    MetricSpec(
        "face.fifths.eye_width_share", "face", "share", "front",
        ("exocanthion_r", "endocanthion_r", "endocanthion_l", "exocanthion_l", "zygion_r", "zygion_l"),
        fifths_eye_width_share,
        reference="mean palpebral fissure width / bizygomatic width",
    ),
    MetricSpec(
        "face.width_height_ratio", "face", "ratio", "front",
        ("zygion_r", "zygion_l", "nasion", "menton"), width_height_ratio,
        reference="bizygomatic width / (nasion to menton height)",
    ),
    MetricSpec(
        "eyes.canthal_tilt", "eyes", "deg", "front",
        ("endocanthion_r", "exocanthion_r", "endocanthion_l", "exocanthion_l"), canthal_tilt,
        reference="arctan((y_en - y_ex) / (x_ex - x_en)) in image axes, mean of both eyes",
    ),
    MetricSpec(
        "eyes.spacing_ratio", "eyes", "ratio", "front",
        ("endocanthion_r", "endocanthion_l", "exocanthion_r", "exocanthion_l"), eye_spacing_ratio,
        reference="intercanthal width / mean palpebral fissure width",
    ),
    MetricSpec(
        "eyes.fissure_ratio", "eyes", "ratio", "front",
        ("lid_upper_r", "lid_lower_r", "lid_upper_l", "lid_lower_l", "exocanthion_r", "exocanthion_l"),
        palpebral_fissure_ratio,
        reference="palpebral fissure height / width, mean of both eyes",
    ),
    MetricSpec(
        "nose.width_to_intercanthal", "nose", "ratio", "front",
        ("alare_r", "alare_l", "endocanthion_r", "endocanthion_l"), nasal_to_intercanthal,
        reference="alar width / intercanthal width",
    ),
    MetricSpec(
        "nose.nasofrontal_angle", "nose", "deg", "lateral",
        ("glabella", "nasion", "pronasale"), nasofrontal_angle, experimental=True,
        reference="angle glabella-nasion-pronasale in the sagittal plane",
    ),
    MetricSpec(
        "nose.nasolabial_angle", "nose", "deg", "lateral",
        ("columella", "subnasale", "labrale_superius"), nasolabial_angle, experimental=True,
        reference="angle columella-subnasale-labrale superius in the sagittal plane",
    ),
    MetricSpec(
        "lips.upper_lower_ratio", "lips", "ratio", "front",
        ("labrale_superius", "stomion_upper", "stomion_lower", "labrale_inferius"), upper_lower_lip_ratio,
        reference="upper vermilion height / lower vermilion height",
    ),
    MetricSpec(
        "lips.mouth_to_nose_width", "lips", "ratio", "front",
        ("cheilion_r", "cheilion_l", "alare_r", "alare_l"), mouth_to_nose_width,
        reference="mouth width (cheilion to cheilion) / alar width",
    ),
    MetricSpec(
        "lips.philtrum_length", "lips", "ipd", "front",
        ("subnasale", "labrale_superius"), philtrum_length,
        reference="subnasale to labrale superius, vertical, in IPD units",
    ),
    MetricSpec(
        "jaw.gonial_angle", "jaw", "deg", "lateral",
        ("zygion", "gonion", "menton"), gonial_angle, experimental=True,
        reference="angle zygion-gonion-menton on the camera-facing side, sagittal plane",
    ),
    MetricSpec(
        "jaw.bigonial_bizygomatic", "jaw", "ratio", "front",
        ("gonion_r", "gonion_l", "zygion_r", "zygion_l"), bigonial_bizygomatic,
        reference="bigonial width / bizygomatic width",
    ),
    MetricSpec(
        "jaw.chin_projection", "jaw", "ipd", "lateral",
        ("pogonion", "subnasale"), chin_projection, experimental=True,
        reference="pogonion depth minus subnasale depth, in IPD units",
    ),
)  # fmt: skip

# Metrics in the spec's MVP table that this build cannot measure honestly, with the reason.
UNAVAILABLE: dict[str, str] = {
    "face.thirds.upper": (
        "The hairline lies above the face mesh, so the upper third cannot be measured yet. "
        "It needs the clinical landmark model."
    ),
    "eyes.upper_lid_exposure": (
        "The eyelid crease is not a mesh landmark, so upper-lid exposure cannot be measured yet. "
        "It needs the clinical landmark model."
    ),
}

BY_KEY: dict[str, MetricSpec] = {spec.key: spec for spec in METRICS}
