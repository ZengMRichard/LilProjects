"""Step 1: the quality gate (spec section 3).

Checks pose, face size, expression, exposure, lighting evenness and sharpness. Detection of
beauty filters, heavy edits and photos of screens needs the trained tamper model (spec section
7) and is reported as not evaluated rather than silently passed.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass

from PIL import Image

from facet_metrics.geometry import dist_xy, frontalize
from facet_worker import protocol
from facet_worker.imaging import face_crop, laplacian_variance, luma, zone_mask


@dataclass(frozen=True)
class Check:
    key: str
    label: str
    passed: bool | None  # None: not evaluated
    detail: str
    value: float | None = None


@dataclass(frozen=True)
class ViewQuality:
    view: str
    passed: bool
    checks: tuple[Check, ...]
    pose: dict[str, float]
    ipd_px: float

    def as_dict(self) -> dict:
        return {
            "view": self.view,
            "passed": self.passed,
            "pose": self.pose,
            "ipd_px": round(self.ipd_px, 1),
            "checks": [asdict(c) for c in self.checks],
        }

    def failures(self) -> list[str]:
        return [f"{self.view}: {c.detail}" for c in self.checks if c.passed is False]


_AXIS_HINT = {
    ("yaw", "low"): "turn your head toward your left",
    ("yaw", "high"): "turn your head toward your right",
    ("pitch", "low"): "lower your chin",
    ("pitch", "high"): "lift your chin",
    ("roll", "low"): "tilt your head toward your right shoulder",
    ("roll", "high"): "tilt your head toward your left shoulder",
}


def pose_check(view: str, pose: Mapping[str, float]) -> Check:
    windows = protocol.VIEWS[view]
    problems = []
    for axis, (low, high) in windows.items():
        angle = pose[axis]
        if angle < low:
            problems.append(
                f"{axis} {angle:+.1f}° is outside {low:+.0f}° to {high:+.0f}° ({_AXIS_HINT[(axis, 'low')]})"
            )
        elif angle > high:
            problems.append(
                f"{axis} {angle:+.1f}° is outside {low:+.0f}° to {high:+.0f}° ({_AXIS_HINT[(axis, 'high')]})"
            )
    if problems:
        return Check("pose", "Head angle", False, "Head angle: " + "; ".join(problems) + ".")
    return Check("pose", "Head angle", True, "Head angle is within the capture window.")


def _camera_side_zones(view: str) -> list[str]:
    # view "left" shows the subject's left cheek; "right" the right.
    if view == "left":
        return ["cheek_l", "forehead", "nose"]
    if view == "right":
        return ["cheek_r", "forehead", "nose"]
    return ["cheek_l", "cheek_r", "forehead", "nose", "chin"]


def image_checks(view: str, image: Image.Image, points_px: Sequence[Sequence[float]], ipd_px: float) -> list[Check]:
    rgb, mapped = face_crop(image, points_px, ipd_px, target_ipd=120.0)
    gray = luma(rgb)
    size = (rgb.shape[1], rgb.shape[0])
    skin = zone_mask(size, mapped, _camera_side_zones(view))
    checks: list[Check] = []
    if skin.sum() < 50:
        return [Check("exposure", "Exposure", False, "The face is not fully inside the frame.")]
    values = gray[skin]
    mean = float(values.mean())
    low, high = protocol.LUMA_RANGE
    clipped = float(((values > 250) | (values < 8)).mean())
    if mean < low:
        checks.append(Check("exposure", "Exposure", False, "The photo is too dark. Face a window or a lamp.", mean))
    elif mean > high or clipped > protocol.MAX_CLIPPED:
        checks.append(
            Check("exposure", "Exposure", False, "The photo is overexposed. Move away from direct light.", mean)
        )
    else:
        checks.append(Check("exposure", "Exposure", True, "Exposure is good.", mean))
    if view == "front":
        left = gray[zone_mask(size, mapped, ["cheek_l"])]
        right = gray[zone_mask(size, mapped, ["cheek_r"])]
        if left.size and right.size and right.mean() > 0:
            ratio = float(left.mean() / right.mean())
            lo, hi = protocol.EVENNESS_RANGE
            even = lo <= ratio <= hi
            checks.append(
                Check(
                    "evenness", "Even lighting", even,
                    "Lighting is even across the face." if even else "Lighting is uneven. Turn to face the light source.",
                    ratio,
                )
            )  # fmt: skip
    sharpness = laplacian_variance(gray)
    sharp = sharpness >= protocol.MIN_SHARPNESS
    checks.append(
        Check(
            "sharpness",
            "Sharpness",
            sharp,
            "The photo is sharp." if sharp else "The photo is blurry. Hold still.",
            sharpness,
        )
    )
    return checks


def assess_view(
    view: str,
    points_px: Sequence[Sequence[float]],
    image: Image.Image | None,
    hints: Mapping[str, object] | None = None,
    synthetic: bool = False,
) -> ViewQuality:
    """Run every check that applies to one captured view."""
    hints = hints or {}
    front = frontalize(points_px)
    pose = {"yaw": round(front.pose.yaw, 2), "pitch": round(front.pose.pitch, 2), "roll": round(front.pose.roll, 2)}
    checks: list[Check] = [pose_check(view, pose)]

    big_enough = front.ipd_px >= protocol.MIN_IPD_PX
    checks.append(
        Check(
            "size", "Distance", big_enough,
            "The face is large enough in the frame." if big_enough else "The face is too small in the frame. Move closer.",
            front.ipd_px,
        )
    )  # fmt: skip

    if synthetic:
        checks.append(Check("expression", "Neutral expression", None, "Not evaluated for the synthetic sample."))
    else:
        gap = (front.p("stomion_upper")[1] - front.p("stomion_lower")[1]) / dist_xy(
            front.p("cheilion_r"), front.p("cheilion_l")
        )
        blend = hints.get("blendshapes") if isinstance(hints.get("blendshapes"), Mapping) else {}
        smile = float(blend.get("smile", 0.0)) if isinstance(blend, Mapping) else 0.0
        jaw_open = float(blend.get("jaw_open", 0.0)) if isinstance(blend, Mapping) else 0.0
        if gap > protocol.MAX_MOUTH_GAP or jaw_open > protocol.MAX_JAW_OPEN:
            checks.append(
                Check("expression", "Neutral expression", False, "Close your mouth and relax your face.", gap)
            )
        elif smile > protocol.MAX_SMILE:
            checks.append(Check("expression", "Neutral expression", False, "Relax your face; no smile.", smile))
        else:
            checks.append(Check("expression", "Neutral expression", True, "Expression is neutral.", gap))

    if image is not None:
        checks.extend(image_checks(view, image, points_px, front.ipd_px))
    elif not synthetic:
        checks.append(Check("exposure", "Exposure", False, "No image was uploaded for this view."))

    if view == "front" and not synthetic:
        live = bool(hints.get("liveness"))
        checks.append(
            Check(
                "liveness", "Live capture", live,
                "A blink was seen during capture." if live else "No blink was seen during capture. Capture again from the camera.",
            )
        )  # fmt: skip
    checks.append(
        Check(
            "tamper", "Filters and edits", None,
            "Not evaluated: filter, edit and screen-recapture detection needs the trained tamper model.",
        )
    )  # fmt: skip
    passed = all(c.passed is not False for c in checks)
    return ViewQuality(view, passed, tuple(checks), pose, front.ipd_px)
