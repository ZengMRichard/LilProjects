"""Write packages/fixtures/pose_cases.json: landmark sets with the pose the Python library
measures. The TypeScript pose code (apps/web/src/lib/face/pose.ts) must reproduce the same
numbers, which is what keeps the capture screen and the server quality gate in agreement.

Run from facet/:  uv run python scripts/build_fixtures.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from tests.helpers import render  # noqa: E402

from facet_metrics.geometry import dist_xy, frontalize  # noqa: E402

CASES = [
    {"name": "frontal", "yaw": 0, "pitch": 0, "roll": 0},
    {"name": "small turn", "yaw": 3.5, "pitch": -2.25, "roll": 1.5},
    {"name": "left cheek to camera", "yaw": -47, "pitch": 4, "roll": -3, "jitter": 0.4, "seed": 3},
    {"name": "right cheek to camera", "yaw": 52, "pitch": -6, "roll": 5, "jitter": 0.4, "seed": 4},
    {"name": "noisy frontal", "yaw": -1.2, "pitch": 6.5, "roll": -4.2, "jitter": 0.8, "seed": 5, "scale": 23.0},
]


def main() -> None:
    out = []
    for case in CASES:
        points = render(
            case["yaw"],
            case["pitch"],
            case["roll"],
            jitter=case.get("jitter", 0.0),
            seed=case.get("seed", 0),
            scale=case.get("scale", 40.0),
            close_mouth=False,
        )
        points = [[round(c, 3) for c in p] for p in points]
        front = frontalize(points)
        gap = (front.p("stomion_upper")[1] - front.p("stomion_lower")[1]) / dist_xy(
            front.p("cheilion_r"), front.p("cheilion_l")
        )
        out.append(
            {
                "name": case["name"],
                "points": points,
                "expected": {
                    "yaw": front.pose.yaw,
                    "pitch": front.pose.pitch,
                    "roll": front.pose.roll,
                    "ipd_px": front.ipd_px,
                    "mouth_gap": gap,
                },
            }
        )
    path = ROOT / "packages/fixtures/pose_cases.json"
    path.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"wrote {len(out)} cases to {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
