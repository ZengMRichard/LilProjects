"""Capture protocol: the thresholds a frame must meet. Served to the web app by the API so the
capture screen and the server quality gate use the same numbers."""

from __future__ import annotations

PROTOCOL_VERSION = "1"

# Head pose windows in degrees. "left" means the subject's left cheek faces the camera, which
# is a turn toward the subject's right (negative yaw).
VIEWS: dict[str, dict[str, tuple[float, float]]] = {
    "front": {"yaw": (-5.0, 5.0), "pitch": (-5.0, 5.0), "roll": (-5.0, 5.0)},
    "left": {"yaw": (-60.0, -35.0), "pitch": (-12.0, 12.0), "roll": (-12.0, 12.0)},
    "right": {"yaw": (35.0, 60.0), "pitch": (-12.0, 12.0), "roll": (-12.0, 12.0)},
    "three_quarter": {"yaw": (20.0, 40.0), "pitch": (-10.0, 10.0), "roll": (-10.0, 10.0)},
}
REQUIRED_VIEWS = ("front",)
CAPTURED_VIEWS = ("front", "left", "right")

MIN_IPD_PX = 70.0  # inter-pupillary distance in the frame; below this the face is too small
MAX_MOUTH_GAP = 0.08  # lip gap / mouth width; above this the mouth is open
MAX_SMILE = 0.4  # blendshape hint from the capture screen
MAX_JAW_OPEN = 0.2
TTA_COUNT = 8

# Image checks, on a 0-255 luma scale.
LUMA_RANGE = (50.0, 225.0)
MAX_CLIPPED = 0.15
EVENNESS_RANGE = (0.70, 1.43)  # left-cheek mean / right-cheek mean
MIN_SHARPNESS = 8.0  # variance of the Laplacian at a 120-px IPD scale
PORES_MIN_IPD_PX = 260.0


def as_dict() -> dict:
    return {
        "version": PROTOCOL_VERSION,
        "views": {name: {axis: list(window) for axis, window in spec.items()} for name, spec in VIEWS.items()},
        "captured_views": list(CAPTURED_VIEWS),
        "min_ipd_px": MIN_IPD_PX,
        "max_mouth_gap": MAX_MOUTH_GAP,
        "max_smile": MAX_SMILE,
        "max_jaw_open": MAX_JAW_OPEN,
        "tta_count": TTA_COUNT,
        "luma_range": list(LUMA_RANGE),
        "max_clipped": MAX_CLIPPED,
        "evenness_range": list(EVENNESS_RANGE),
        "min_sharpness": MIN_SHARPNESS,
    }
