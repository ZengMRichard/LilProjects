"""Golden report (spec section 11): a fixed scan whose full report JSON is snapshot-tested.

Regenerate after an intended change with:  UPDATE_GOLDEN=1 uv run pytest tests/test_golden.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from facet_metrics.canonical import LANDMARKS
from tests.conftest import onboard, synthetic_scan

GOLDEN = Path(__file__).parent / "golden" / "report_synthetic_warped.json"
VOLATILE = ("id", "scan_id", "created_at", "report_id")


def _warp(index, x, y, z):
    """A fixed, slightly asymmetric face with a longer lower third."""
    if index == LANDMARKS["cheilion_r"]:
        return (x - 0.12, y + 0.18, z)
    if index == LANDMARKS["exocanthion_l"]:
        return (x, y + 0.14, z)
    if y < -2.2:
        return (x, y * 1.06, z)
    return (x, y, z)


def _stable(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _stable(v) for k, v in value.items() if k not in VOLATILE}
    if isinstance(value, list):
        return [_stable(v) for v in value]
    if isinstance(value, float):
        return round(value, 6)
    return value


def test_full_report_matches_the_golden_snapshot(client):
    onboard(client)
    scan = synthetic_scan(client, warp=_warp, goals=("skin", "style"))
    client.post("/v1/billing/checkout", json={"report_id": scan["report_id"]})
    report = _stable(client.get(f"/v1/reports/{scan['report_id']}").json())
    for item in report["plan"]["items"]:
        item.pop("id", None)
    text = json.dumps(report, indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    if os.environ.get("UPDATE_GOLDEN"):
        GOLDEN.parent.mkdir(exist_ok=True)
        GOLDEN.write_text(text)
    assert GOLDEN.exists(), "run with UPDATE_GOLDEN=1 to create the snapshot"
    assert json.loads(text) == json.loads(GOLDEN.read_text())
