"""Write apps/web/src/content/sample-report.json: a full report produced by running the real
pipeline on a synthetic face. The public /sample page renders it.

Run from facet/:  uv run python scripts/build_sample_report.py
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402
from tests.conftest import ORIGIN, onboard, synthetic_scan  # noqa: E402

from facet_api.app import create_app  # noqa: E402
from facet_api.config import Settings  # noqa: E402
from facet_metrics.canonical import LANDMARKS  # noqa: E402


def warp(index: int, x: float, y: float, z: float) -> tuple[float, float, float]:
    """A model face with mild, ordinary left-right differences and a slightly longer lower third."""
    if index == LANDMARKS["cheilion_r"]:
        return (x - 0.1, y + 0.16, z)
    if index == LANDMARKS["exocanthion_l"]:
        return (x + 0.05, y + 0.12, z)
    if x > 0 and -6 < y < 0:
        x, y = x + 0.06, y - 0.05
    if y < -2.2:
        y *= 1.05
    return (x, y, z)


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        settings = Settings(
            env="dev",
            data_dir=Path(tmp),
            db_url=f"sqlite:///{tmp}/facet.db",
            scan_min_interval_days=0,
            worker_inline=True,
            secret=b"s" * 32,
            storage_key=b"k" * 32,
        )
        with TestClient(create_app(settings), headers={"origin": ORIGIN}) as client:
            onboard(client, "sample@example.com")
            scan = synthetic_scan(client, warp=warp, goals=("skin", "style"))
            client.post("/v1/billing/checkout", json={"report_id": scan["report_id"]})
            report = client.get(f"/v1/reports/{scan['report_id']}").json()
    report["id"], report["scan_id"] = "rep_sample", "scn_sample"
    report["created_at"] = "2026-11-11T12:00:00Z"
    for index, item in enumerate(report["plan"]["items"]):
        item["id"] = f"pln_sample_{index}"
    report["plan"]["report_id"] = "rep_sample"
    path = ROOT / "apps/web/src/content/sample-report.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, separators=(",", ":")) + "\n")
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
