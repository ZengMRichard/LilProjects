"""Vector math, head pose and frontalisation.

Coordinate frames
-----------------
*Image space* is what the landmark model reports, scaled to pixels: x right, y down, z roughly
in pixels with smaller meaning closer to the camera.

*Face space* is right-handed with x toward the subject's left (image right), y up and z toward
the camera. All metric functions work in face space after the head rotation has been removed
("frontalised"), with distances divided by the inter-pupillary distance (IPD).

The same pose algorithm is implemented in TypeScript (apps/web/src/lib/face/pose.ts) so the
capture screen and the server agree on every angle; packages/fixtures/pose_cases.json pins both.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from facet_metrics.canonical import (
    ALAR_L,
    ALAR_R,
    EYE_RING_L,
    EYE_RING_R,
    LANDMARKS,
    MESH_VERTICES,
    MESH_VERTICES_WITH_IRIS,
    PUPIL_L,
    PUPIL_R,
    Vec,
    canonical,
)

Mat3 = tuple[Vec, Vec, Vec]  # rows


def sub(a: Vec, b: Vec) -> Vec:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def add(a: Vec, b: Vec) -> Vec:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def scale(a: Vec, k: float) -> Vec:
    return (a[0] * k, a[1] * k, a[2] * k)


def dot(a: Vec, b: Vec) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def norm(a: Vec) -> float:
    return math.sqrt(dot(a, a))


def dist(a: Vec, b: Vec) -> float:
    return norm(sub(a, b))


def dist_xy(a: Vec, b: Vec) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def centroid(points: Sequence[Vec]) -> Vec:
    n = len(points)
    return (sum(p[0] for p in points) / n, sum(p[1] for p in points) / n, sum(p[2] for p in points) / n)


def angle_deg(u: tuple[float, float], v: tuple[float, float]) -> float:
    """Unsigned angle between two 2D vectors, in degrees."""
    lu, lv = math.hypot(*u), math.hypot(*v)
    if lu == 0 or lv == 0:
        raise ValueError("zero-length vector")
    cosine = max(-1.0, min(1.0, (u[0] * v[0] + u[1] * v[1]) / (lu * lv)))
    return math.degrees(math.acos(cosine))


def mat_vec(m: Mat3, v: Vec) -> Vec:
    return (dot(m[0], v), dot(m[1], v), dot(m[2], v))


def transpose(m: Mat3) -> Mat3:
    return ((m[0][0], m[1][0], m[2][0]), (m[0][1], m[1][1], m[2][1]), (m[0][2], m[1][2], m[2][2]))


def to_face_space(points_px: Sequence[Sequence[float]]) -> list[Vec]:
    """Image-space pixels (x right, y down, z away) to face space (x left, y up, z to camera)."""
    return [(float(p[0]), -float(p[1]), -float(p[2])) for p in points_px]


def _jacobi_eigen_symmetric(a: list[list[float]]) -> tuple[list[float], list[list[float]]]:
    """Eigen-decomposition of a small symmetric matrix by cyclic Jacobi rotations."""
    n = len(a)
    a = [row[:] for row in a]
    v = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for _ in range(64):
        off = sum(a[i][j] * a[i][j] for i in range(n) for j in range(i + 1, n))
        if off < 1e-22:
            break
        for p in range(n - 1):
            for q in range(p + 1, n):
                if abs(a[p][q]) < 1e-300:
                    continue
                theta = (a[q][q] - a[p][p]) / (2.0 * a[p][q])
                t = (1.0 if theta >= 0 else -1.0) / (abs(theta) + math.sqrt(theta * theta + 1.0))
                c = 1.0 / math.sqrt(t * t + 1.0)
                s = t * c
                for k in range(n):
                    akp, akq = a[k][p], a[k][q]
                    a[k][p] = c * akp - s * akq
                    a[k][q] = s * akp + c * akq
                for k in range(n):
                    apk, aqk = a[p][k], a[q][k]
                    a[p][k] = c * apk - s * aqk
                    a[q][k] = s * apk + c * aqk
                for k in range(n):
                    vkp, vkq = v[k][p], v[k][q]
                    v[k][p] = c * vkp - s * vkq
                    v[k][q] = s * vkp + c * vkq
    return [a[i][i] for i in range(n)], v


def best_rotation(source: Sequence[Vec], target: Sequence[Vec]) -> Mat3:
    """Rotation R minimising sum |R (s - s_mean) - (t - t_mean)|^2 (Horn's quaternion method)."""
    if len(source) != len(target) or len(source) < 3:
        raise ValueError("need at least three matched points")
    cs, ct = centroid(source), centroid(target)
    m = [[0.0] * 3 for _ in range(3)]
    for s, t in zip(source, target, strict=True):
        a, b = sub(s, cs), sub(t, ct)
        for i in range(3):
            for j in range(3):
                m[i][j] += a[i] * b[j]
    sxx, sxy, sxz = m[0]
    syx, syy, syz = m[1]
    szx, szy, szz = m[2]
    n = [
        [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
        [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
        [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
        [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
    ]
    values, vectors = _jacobi_eigen_symmetric(n)
    k = max(range(4), key=lambda i: values[i])
    w, x, y, z = (vectors[i][k] for i in range(4))
    length = math.sqrt(w * w + x * x + y * y + z * z)
    w, x, y, z = w / length, x / length, y / length, z / length
    return (
        (1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)),
        (2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)),
        (2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)),
    )


@dataclass(frozen=True)
class Pose:
    """Head rotation relative to a camera-facing head, in degrees.

    yaw > 0: the subject has turned toward their own left (their right cheek faces the camera).
    pitch > 0: chin down. roll > 0: head tilted toward the subject's right shoulder.
    """

    yaw: float
    pitch: float
    roll: float
    rotation: Mat3


def estimate_pose(face_points: Sequence[Vec]) -> Pose:
    """Fit the canonical upper face to the observed landmarks and read off the rotation."""
    _check_count(face_points)
    model = canonical()
    source = [model.vertices[i] for i in model.rigid]
    target = [face_points[i] for i in model.rigid]
    r = best_rotation(source, target)
    # R = Ry(yaw) Rx(pitch) Rz(roll)
    pitch = -math.asin(max(-1.0, min(1.0, r[1][2])))
    yaw = math.atan2(r[0][2], r[2][2])
    roll = math.atan2(r[1][0], r[1][1])
    return Pose(math.degrees(yaw), math.degrees(pitch), math.degrees(roll), r)


def _check_count(points: Sequence[Vec]) -> None:
    if len(points) not in (MESH_VERTICES, MESH_VERTICES_WITH_IRIS):
        raise ValueError(f"expected {MESH_VERTICES} or {MESH_VERTICES_WITH_IRIS} landmarks, got {len(points)}")


def pupils(points: Sequence[Vec]) -> tuple[Vec, Vec]:
    """(subject's right pupil, subject's left pupil)."""
    if len(points) >= MESH_VERTICES_WITH_IRIS:
        return points[PUPIL_R], points[PUPIL_L]
    return centroid([points[i] for i in EYE_RING_R]), centroid([points[i] for i in EYE_RING_L])


@dataclass(frozen=True)
class Frontal:
    """Landmarks with head rotation removed, in IPD units.

    The origin is the centroid of the pose-fit vertices in x (so x = 0 is the fitted mid-sagittal
    plane) and the pupil midpoint in y and z.
    """

    points: tuple[Vec, ...]
    pose: Pose
    ipd_px: float

    def p(self, name: str) -> Vec:
        return self.points[LANDMARKS[name]]

    def stomion(self) -> Vec:
        a, b = self.p("stomion_upper"), self.p("stomion_lower")
        return scale(add(a, b), 0.5)

    def alare(self, side: str) -> Vec:
        candidates = ALAR_R if side == "r" else ALAR_L
        return max((self.points[i] for i in candidates), key=lambda v: abs(v[0]))

    def pupil(self, side: str) -> Vec:
        right, left = pupils(self.points)
        return right if side == "r" else left


def frontalize(points_px: Sequence[Sequence[float]]) -> Frontal:
    """Remove head rotation and scale so the inter-pupillary distance is 1."""
    face = to_face_space(points_px)
    pose = estimate_pose(face)
    model = canonical()
    inverse = transpose(pose.rotation)
    rotated = [mat_vec(inverse, p) for p in face]
    right, left = pupils(rotated)
    ipd = dist(right, left)
    if ipd <= 0:
        raise ValueError("pupils coincide")
    mid = scale(add(right, left), 0.5)
    origin_x = centroid([rotated[i] for i in model.rigid])[0]
    origin = (origin_x, mid[1], mid[2])
    return Frontal(tuple(scale(sub(p, origin), 1.0 / ipd) for p in rotated), pose, ipd)
