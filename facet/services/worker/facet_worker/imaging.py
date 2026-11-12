"""Small image helpers shared by the quality gate and the skin snapshot."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from PIL import Image, ImageDraw

from facet_metrics.canonical import canonical

Array = np.ndarray


def luma(rgb: Array) -> Array:
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def gaussian_blur(a: Array, sigma: float) -> Array:
    """Separable Gaussian blur with edge replication."""
    radius = max(1, int(round(3 * sigma)))
    xs = np.arange(-radius, radius + 1)
    kernel = np.exp(-(xs**2) / (2 * sigma * sigma))
    kernel /= kernel.sum()
    out = a
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (radius, radius)
        padded = np.pad(out, pad, mode="edge")
        acc = np.zeros_like(out, dtype=np.float64)
        for i, w in enumerate(kernel):
            index = [slice(None), slice(None)]
            index[axis] = slice(i, i + out.shape[axis])
            acc += w * padded[tuple(index)]
        out = acc
    return out


def laplacian_variance(gray: Array) -> float:
    core = gray[1:-1, 1:-1]
    lap = gray[:-2, 1:-1] + gray[2:, 1:-1] + gray[1:-1, :-2] + gray[1:-1, 2:] - 4 * core
    return float(lap.var())


def zone_mask(size: tuple[int, int], points_xy: Sequence[tuple[float, float]], zones: Sequence[str]) -> Array:
    """Boolean mask (height, width) covering the mesh triangles of the named zones."""
    model = canonical()
    mask = Image.new("1", size, 0)
    draw = ImageDraw.Draw(mask)
    for zone in zones:
        for face_index in model.zones[zone]:
            a, b, c = model.faces[face_index]
            draw.polygon([points_xy[a], points_xy[b], points_xy[c]], fill=1)
    return np.asarray(mask, dtype=bool)


def face_crop(
    image: Image.Image, points_px: Sequence[Sequence[float]], ipd_px: float, target_ipd: float
) -> tuple[Array, list[tuple[float, float]]]:
    """Crop to the face, resample so the IPD is ``target_ipd`` pixels (never upsampling), and
    return float RGB (0-255) with the landmarks mapped into the crop."""
    xs = [p[0] for p in points_px]
    ys = [p[1] for p in points_px]
    margin = 0.15 * (max(xs) - min(xs))
    left = max(0, int(min(xs) - margin))
    top = max(0, int(min(ys) - margin))
    right = min(image.width, int(max(xs) + margin) + 1)
    bottom = min(image.height, int(max(ys) + margin) + 1)
    crop = image.convert("RGB").crop((left, top, right, bottom))
    factor = min(1.0, target_ipd / ipd_px)
    if factor < 1.0:
        crop = crop.resize(
            (max(8, round(crop.width * factor)), max(8, round(crop.height * factor))), Image.Resampling.LANCZOS
        )
    mapped = [((p[0] - left) * factor, (p[1] - top) * factor) for p in points_px]
    return np.asarray(crop, dtype=np.float64), mapped


def srgb_to_lab(rgb: Array) -> tuple[Array, Array, Array]:
    """sRGB (0-255) to CIELAB (D65)."""
    c = rgb / 255.0
    linear = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    x = 0.4124564 * linear[..., 0] + 0.3575761 * linear[..., 1] + 0.1804375 * linear[..., 2]
    y = 0.2126729 * linear[..., 0] + 0.7151522 * linear[..., 1] + 0.0721750 * linear[..., 2]
    z = 0.0193339 * linear[..., 0] + 0.1191920 * linear[..., 1] + 0.9503041 * linear[..., 2]

    def f(t: Array) -> Array:
        return np.where(t > 0.008856, np.cbrt(t), 7.787 * t + 16.0 / 116.0)

    fx, fy, fz = f(x / 0.95047), f(y), f(z / 1.08883)
    return 116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz)
