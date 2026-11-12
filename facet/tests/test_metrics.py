"""Metrics library: synthetic landmark fixtures with known geometry (spec section 11)."""

from __future__ import annotations

import math

import pytest

from facet_metrics import METRICS, UNAVAILABLE, ViewLandmarks, compute_report_metrics, estimate_pose
from facet_metrics.canonical import LANDMARKS, canonical
from facet_metrics.geometry import best_rotation, frontalize, to_face_space
from facet_metrics.registry import BY_KEY
from facet_metrics.shape import classify_face_shape
from facet_metrics.symmetry import symmetry
from tests.helpers import augmentations, render, rotation

FRONT_KEYS = [spec.key for spec in METRICS if spec.view == "front"]


def front_only(points) -> dict:
    return {"front": ViewLandmarks("front", points)}


def test_perfectly_symmetric_face_scores_one():
    result = compute_report_metrics(front_only(render(close_mouth=False)))
    assert result.values["symmetry.overall"].value == pytest.approx(1.0, abs=1e-9)
    assert result.symmetry is not None
    assert all(index == pytest.approx(1.0, abs=1e-9) for index in result.symmetry.regions.values())


def test_canonical_values_match_hand_calculation():
    """Expected values worked out by hand from the canonical vertex coordinates."""
    values = compute_report_metrics(front_only(render(close_mouth=False))).values
    v = canonical().vertices
    middle = v[9][1] - v[2][1]
    lower = v[2][1] - v[152][1]
    assert values["face.thirds.middle_lower_ratio"].value == pytest.approx(middle / lower, rel=1e-6)
    intercanthal = v[362][0] - v[133][0]
    cheek = v[454][0] - v[234][0]
    assert values["face.fifths.intercanthal_share"].value == pytest.approx(intercanthal / cheek, rel=1e-6)
    assert values["face.width_height_ratio"].value == pytest.approx(cheek / (v[168][1] - v[152][1]), rel=1e-6)
    tilt = math.degrees(math.atan2(v[33][1] - v[133][1], abs(v[33][0] - v[133][0])))
    assert values["eyes.canthal_tilt"].value == pytest.approx(tilt, abs=1e-6)
    assert values["jaw.bigonial_bizygomatic"].value == pytest.approx((v[397][0] - v[172][0]) / cheek, rel=1e-6)
    assert values["nose.width_to_intercanthal"].value == pytest.approx((v[358][0] - v[129][0]) / intercanthal, rel=1e-6)


@pytest.mark.parametrize("pose", [(0, 0, 0), (4, -3, 2), (-45, 5, -3), (50, 0, 0), (20, 10, -8), (-58, -9, 11)])
def test_pose_is_recovered(pose):
    estimated = estimate_pose(to_face_space(render(*pose)))
    assert (estimated.yaw, estimated.pitch, estimated.roll) == pytest.approx(pose, abs=1e-6)


def test_pose_sign_conventions():
    # A turn toward the subject's left moves the nose tip toward image right.
    front, turned = render(), render(yaw=20)
    assert turned[4][0] > front[4][0]
    assert estimate_pose(to_face_space(turned)).yaw > 0
    # Chin down: the nose tip drops in the image (larger y).
    assert render(pitch=15)[4][1] > front[4][1]


def test_best_rotation_is_a_proper_rotation():
    source = [canonical().vertices[i] for i in canonical().rigid]
    matrix = rotation(33, -12, 7)
    target = [tuple(sum(matrix[r][k] * p[k] for k in range(3)) for r in range(3)) for p in source]
    fitted = best_rotation(source, target)  # type: ignore[arg-type]
    for r in range(3):
        for c in range(3):
            assert fitted[r][c] == pytest.approx(matrix[r][c], abs=1e-9)
    determinant = (
        fitted[0][0] * (fitted[1][1] * fitted[2][2] - fitted[1][2] * fitted[2][1])
        - fitted[0][1] * (fitted[1][0] * fitted[2][2] - fitted[1][2] * fitted[2][0])
        + fitted[0][2] * (fitted[1][0] * fitted[2][1] - fitted[1][1] * fitted[2][0])
    )
    assert determinant == pytest.approx(1.0, abs=1e-9)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"scale": 22.0},
        {"scale": 71.0, "cx": 900.0, "cy": 300.0},
        {"yaw": 4.5, "pitch": -4.0, "roll": 3.0},
        {"yaw": -5.0, "pitch": 5.0, "roll": -5.0, "scale": 55.0},
    ],
)
def test_frontal_metrics_ignore_distance_position_and_small_head_turns(kwargs):
    """Scale normalisation and frontalisation: the same face gives the same numbers."""
    baseline = compute_report_metrics(front_only(render())).values
    moved = compute_report_metrics(front_only(render(**kwargs))).values
    for key in [*FRONT_KEYS, "symmetry.overall"]:
        assert moved[key].value == pytest.approx(baseline[key].value, abs=1e-6), key


def test_asymmetry_lowers_the_index_in_the_right_region():
    def lift_right_mouth_corner(index, x, y, z):
        return (x, y + 0.5, z) if index == LANDMARKS["cheilion_r"] else (x, y, z)

    result = compute_report_metrics(front_only(render(warp=lift_right_mouth_corner)))
    assert result.symmetry is not None
    assert result.values["symmetry.overall"].value < 1.0
    assert result.symmetry.regions["mouth"] < 0.999
    assert result.symmetry.regions["eyes"] == pytest.approx(1.0, abs=1e-6)
    worst = max(result.symmetry.pairs, key=lambda p: p.deviation)
    assert worst.right == LANDMARKS["cheilion_r"]
    # 0.5 canonical units over a 6.37-unit IPD
    assert worst.deviation == pytest.approx(0.5 / frontalize(render()).ipd_px * 40.0, rel=1e-3)


def test_metrics_respond_to_known_changes():
    def wider_jaw(index, x, y, z):
        return (x * 1.15, y, z) if index in (LANDMARKS["gonion_r"], LANDMARKS["gonion_l"]) else (x, y, z)

    def tilted_eyes(index, x, y, z):
        if index in (LANDMARKS["exocanthion_r"], LANDMARKS["exocanthion_l"]):
            return (x, y + 0.3, z)
        return (x, y, z)

    base = compute_report_metrics(front_only(render())).values
    jaw = compute_report_metrics(front_only(render(warp=wider_jaw))).values
    eyes = compute_report_metrics(front_only(render(warp=tilted_eyes))).values
    assert jaw["jaw.bigonial_bizygomatic"].value == pytest.approx(
        base["jaw.bigonial_bizygomatic"].value * 1.15, rel=1e-3
    )
    assert eyes["eyes.canthal_tilt"].value > base["eyes.canthal_tilt"].value + 5


def test_uncertainty_interval_reflects_landmark_spread():
    points = render()
    quiet = compute_report_metrics({"front": ViewLandmarks("front", points, augmentations(points, sigma=0.05))})
    noisy = compute_report_metrics({"front": ViewLandmarks("front", points, augmentations(points, sigma=0.8))})
    for key in FRONT_KEYS:
        q, n = quiet.values[key], noisy.values[key]
        assert q.ci_low is not None and q.ci_high is not None and n.ci_low is not None and n.ci_high is not None
        assert q.ci_low <= q.value <= q.ci_high
        assert (n.ci_high - n.ci_low) > (q.ci_high - q.ci_low), key
        assert q.samples == 9


def test_no_interval_without_augmentations():
    value = compute_report_metrics(front_only(render())).values["eyes.canthal_tilt"]
    assert value.ci_low is None and value.ci_high is None


def test_lateral_metrics_need_a_turned_view():
    front = compute_report_metrics(front_only(render()))
    missing = {u.key for u in front.unavailable}
    lateral = {spec.key for spec in METRICS if spec.view == "lateral"}
    assert lateral <= missing
    assert set(UNAVAILABLE) <= missing
    assert not lateral & set(front.values)

    both = compute_report_metrics(
        {
            "front": ViewLandmarks("front", render()),
            "left": ViewLandmarks("left", render(yaw=-45)),
            "right": ViewLandmarks("right", render(yaw=45)),
        }
    )
    assert lateral <= set(both.values)
    # Hand-computed from the canonical sagittal profile.
    assert both.values["nose.nasofrontal_angle"].value == pytest.approx(142.53, abs=0.01)
    assert both.values["jaw.chin_projection"].value < 0
    assert both.values["nose.nasofrontal_angle"].views == ("left", "right")


def test_lateral_metrics_are_all_experimental_and_frontal_ones_are_not():
    for spec in METRICS:
        assert spec.experimental == (spec.view == "lateral"), spec.key
        assert spec.reference, spec.key
    assert len({spec.key for spec in METRICS}) == len(METRICS) == len(BY_KEY)


def test_face_shape_follows_the_measured_ratios():
    assert classify_face_shape(frontalize(render())).label == "oval"

    def long_face(index, x, y, z):
        return (x, y * 1.18, z)

    def wide_jaw(index, x, y, z):
        return (x * 1.12, y * 0.93, z) if y < -3 else (x, y * 0.93, z)

    assert classify_face_shape(frontalize(render(warp=long_face))).label == "oblong"
    assert classify_face_shape(frontalize(render(warp=wide_jaw))).label in ("square", "round")


def test_works_with_iris_landmarks():
    points = render()
    right = [sum(points[i][k] for i in (33, 133, 159, 145)) / 4 for k in range(3)]
    left = [sum(points[i][k] for i in (263, 362, 386, 374)) / 4 for k in range(3)]
    with_iris = points + [right] * 5 + [left] * 5
    a = compute_report_metrics(front_only(points)).values
    b = compute_report_metrics(front_only(with_iris)).values
    for key in FRONT_KEYS:
        assert a[key].value == pytest.approx(b[key].value, rel=1e-9)


def test_rejects_wrong_landmark_count_and_missing_front():
    with pytest.raises(ValueError, match="expected 468 or 478"):
        compute_report_metrics(front_only(render()[:100]))
    with pytest.raises(ValueError, match="front view is required"):
        compute_report_metrics({"left": ViewLandmarks("left", render(yaw=-45))})


def test_symmetry_excludes_unstable_outline_pairs():
    result = symmetry(frontalize(render()))
    assert {p.region for p in result.pairs} == {"brows", "eyes", "nose", "cheeks", "mouth", "jaw"}
    assert len(result.pairs) == 148
