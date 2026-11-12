"""Skin snapshot (spec section 3): texture, redness, pores, spots and under-eye darkness, each
as a low / medium / high band.

EXPERIMENTAL. These are classical image statistics over mesh-defined skin zones, not the trained
skin classifier in spec section 7. The band cut-offs are uncalibrated, they shift with lighting
and camera, and they have not been tested across skin tones. The report labels them that way.
The release gate for a real skin model is macro-F1 >= 0.75 with a per-Fitzpatrick breakdown.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from PIL import Image

from facet_worker import protocol
from facet_worker.imaging import face_crop, gaussian_blur, srgb_to_lab, zone_mask

SKIN_VERSION = "image-stats-0.1"
TARGET_IPD = 160.0

# (medium from, high from). Provisional and uncalibrated.
CUTS: dict[str, tuple[float, float]] = {
    "texture": (2.6, 4.2),  # fine-scale lightness variation, % of local lightness
    "redness": (2.0, 5.0),  # a* of cheeks and nose above forehead and chin, CIELAB units
    "spots": (2.5, 6.0),  # % of skin area in small dark patches
    "pores": (2.0, 5.0),  # % of nose and inner-cheek area in very small dark dots
    "under_eye": (5.0, 11.0),  # under-eye lightness below the cheek, % of cheek lightness
}
LABELS = {
    "texture": "Texture",
    "redness": "Redness",
    "pores": "Visible pores",
    "spots": "Spots",
    "under_eye": "Under-eye darkness",
}
TEXT = {
    "texture": {
        "low": "The skin on your cheeks and forehead reads as smooth at this resolution.",
        "medium": "There is some fine surface variation on your cheeks and forehead.",
        "high": "There is noticeable fine surface variation on your cheeks and forehead. Sharp side lighting raises this reading.",
    },
    "redness": {
        "low": "Your cheeks and nose are close in tone to your forehead and chin.",
        "medium": "Your cheeks and nose are somewhat redder than your forehead and chin.",
        "high": "Your cheeks and nose are clearly redder than your forehead and chin. Warm lighting or recent exercise raises this reading.",
    },
    "spots": {
        "low": "Few small darker patches were found.",
        "medium": "Some small darker patches were found. Freckles, stubble and shadows all count toward this.",
        "high": "Many small darker patches were found. Freckles, stubble and shadows all count toward this.",
    },
    "pores": {
        "low": "Few visible pores at this resolution.",
        "medium": "Some visible pores on the nose and inner cheeks.",
        "high": "Many visible pores on the nose and inner cheeks.",
    },
    "under_eye": {
        "low": "The skin under your eyes is close in lightness to your cheeks.",
        "medium": "The skin under your eyes is somewhat darker than your cheeks.",
        "high": "The skin under your eyes is clearly darker than your cheeks. Overhead lighting casts shadows here and raises this reading.",
    },
}  # fmt: skip


@dataclass(frozen=True)
class SkinAttribute:
    key: str
    label: str
    band: str | None  # low | medium | high; None when not assessed
    value: float | None
    text: str


def _band(key: str, value: float) -> str:
    medium, high = CUTS[key]
    return "high" if value >= high else "medium" if value >= medium else "low"


def _attribute(key: str, value: float) -> SkinAttribute:
    band = _band(key, value)
    return SkinAttribute(key, LABELS[key], band, round(float(value), 3), TEXT[key][band])


def analyze_skin(image: Image.Image, points_px: Sequence[Sequence[float]], ipd_px: float) -> list[SkinAttribute]:
    rgb, mapped = face_crop(image, points_px, ipd_px, target_ipd=TARGET_IPD)
    size = (rgb.shape[1], rgb.shape[0])
    lightness, a_star, _ = srgb_to_lab(rgb)
    scale = min(1.0, TARGET_IPD / ipd_px) * ipd_px / TARGET_IPD  # 1.0 unless the source IPD is below target

    cheeks = zone_mask(size, mapped, ["cheek_l", "cheek_r"])
    forehead = zone_mask(size, mapped, ["forehead"])
    nose = zone_mask(size, mapped, ["nose"])
    chin = zone_mask(size, mapped, ["chin"])
    under = zone_mask(size, mapped, ["under_eye_l", "under_eye_r"])
    broad = cheeks | forehead

    out: list[SkinAttribute] = []

    smooth = gaussian_blur(lightness, max(1.0, 2.0 * scale))
    local = gaussian_blur(lightness, max(2.0, 8.0 * scale))
    fine = lightness - smooth
    texture = 100.0 * float(np.sqrt(np.mean(fine[broad] ** 2))) / max(1.0, float(local[broad].mean()))
    out.append(_attribute("texture", texture))

    redness = float(a_star[cheeks | nose].mean() - a_star[forehead | chin].mean())
    out.append(_attribute("redness", max(0.0, redness)))

    band_pass = gaussian_blur(lightness, max(1.0, 1.5 * scale)) - gaussian_blur(lightness, max(3.0, 6.0 * scale))
    relative = band_pass / np.maximum(local, 1.0)
    spots = 100.0 * float((relative[broad] < -0.06).mean())
    out.append(_attribute("spots", spots))

    if ipd_px >= protocol.PORES_MIN_IPD_PX:
        dots = gaussian_blur(lightness, 0.8) - gaussian_blur(lightness, 2.5)
        zone = nose | cheeks
        pores = 100.0 * float(((dots / np.maximum(local, 1.0))[zone] < -0.035).mean())
        out.append(_attribute("pores", pores))
    else:
        out.append(
            SkinAttribute(
                "pores", LABELS["pores"], None, None,
                f"Not assessed: pores need a sharper image (about {protocol.PORES_MIN_IPD_PX:.0f} pixels between "
                f"the pupils; this capture has {ipd_px:.0f}).",
            )
        )  # fmt: skip

    cheek_light = float(lightness[cheeks].mean())
    under_eye = 100.0 * (cheek_light - float(lightness[under].mean())) / max(1.0, cheek_light)
    out.append(_attribute("under_eye", max(0.0, under_eye)))
    return out
