"""The shared pose fixtures must match what the library computes today."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from facet_metrics.geometry import frontalize

CASES = json.loads((Path(__file__).parent.parent / "packages/fixtures/pose_cases.json").read_text())


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_pose_fixture(case):
    front = frontalize(case["points"])
    expected = case["expected"]
    assert front.pose.yaw == pytest.approx(expected["yaw"], abs=1e-9)
    assert front.pose.pitch == pytest.approx(expected["pitch"], abs=1e-9)
    assert front.pose.roll == pytest.approx(expected["roll"], abs=1e-9)
    assert front.ipd_px == pytest.approx(expected["ipd_px"], rel=1e-12)
