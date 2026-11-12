"""Synthetic landmark and image fixtures with known geometry."""

from __future__ import annotations

import io
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from facet_metrics.canonical import canonical


def rotation(yaw: float, pitch: float, roll: float) -> list[list[float]]:
    """R = Ry(yaw) Rx(pitch) Rz(roll), degrees."""
    y, p, r = (math.radians(a) for a in (yaw, pitch, roll))
    cy, sy, cp, sp, cr, sr = math.cos(y), math.sin(y), math.cos(p), math.sin(p), math.cos(r), math.sin(r)
    return [
        [cy * cr + sy * sp * sr, -cy * sr + sy * sp * cr, sy * cp],
        [cp * sr, cp * cr, -sp],
        [-sy * cr + cy * sp * sr, sy * sr + cy * sp * cr, cy * cp],
    ]


def render(
    yaw: float = 0.0,
    pitch: float = 0.0,
    roll: float = 0.0,
    *,
    scale: float = 40.0,
    cx: float = 360.0,
    cy: float = 480.0,
    jitter: float = 0.0,
    seed: int = 0,
    warp=None,
    close_mouth: bool = True,
) -> list[list[float]]:
    """The canonical face as image-space landmarks (pixels), optionally warped and jittered.

    ``warp`` maps a canonical vertex (index, x, y, z) to a new (x, y, z) before projection, to
    build faces with known asymmetry or different proportions.
    """
    rng = random.Random(seed)
    matrix = rotation(yaw, pitch, roll)
    out = []
    vertices = canonical().vertices
    for index, vertex in enumerate(vertices):
        x, y, z = vertex
        if close_mouth and index == 14:
            x, y, z = vertices[13][0], vertices[13][1] - 0.05, vertices[13][2]
        if warp is not None:
            x, y, z = warp(index, x, y, z)
        fx = matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z
        fy = matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z
        fz = matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z
        out.append(
            [
                cx + scale * fx + rng.gauss(0, jitter),
                cy - scale * fy + rng.gauss(0, jitter),
                -scale * fz + rng.gauss(0, jitter),
            ]
        )
    return out


def augmentations(
    points: list[list[float]], count: int = 8, sigma: float = 0.25, seed: int = 1
) -> list[list[list[float]]]:
    rng = random.Random(seed)
    return [[[c + rng.gauss(0, sigma) for c in p] for p in points] for _ in range(count)]


def face_image(
    points: list[list[float]],
    size: tuple[int, int] = (720, 960),
    *,
    skin: tuple[int, int, int] = (198, 158, 138),
    cheek_tint: tuple[int, int, int] = (0, 0, 0),
    under_eye_shade: int = 0,
    noise: float = 4.0,
    blur: float = 0.0,
    brightness: float = 1.0,
    seed: int = 7,
) -> bytes:
    """A flat-shaded face drawn from the mesh, as JPEG bytes. Good enough to exercise the
    exposure, sharpness and skin statistics with known inputs."""
    model = canonical()
    image = Image.new("RGB", size, (40, 44, 52))
    draw = ImageDraw.Draw(image)
    xy = [(p[0], p[1]) for p in points]
    for a, b, c in model.faces:
        draw.polygon([xy[a], xy[b], xy[c]], fill=skin)

    def tint(zones: list[str], delta: tuple[int, int, int]) -> None:
        colour = tuple(max(0, min(255, base + d)) for base, d in zip(skin, delta, strict=True))
        for zone in zones:
            for face_index in model.zones[zone]:
                a, b, c = model.faces[face_index]
                draw.polygon([xy[a], xy[b], xy[c]], fill=colour)

    if any(cheek_tint):
        tint(["cheek_l", "cheek_r", "nose"], cheek_tint)
    if under_eye_shade:
        tint(["under_eye_l", "under_eye_r"], (-under_eye_shade, -under_eye_shade, -under_eye_shade))

    array = np.asarray(image, dtype=np.float64)
    grain = np.random.default_rng(seed).normal(0.0, noise, array.shape[:2])
    array = np.clip((array + grain[..., None]) * brightness, 0, 255).astype(np.uint8)
    image = Image.fromarray(array)
    if blur:
        image = image.filter(ImageFilter.GaussianBlur(blur))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=95)
    return buffer.getvalue()
