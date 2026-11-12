"""Build canonical_face.json from MediaPipe's canonical face model.

Run from the facet/ directory:  uv run python scripts/build_canonical.py

Outputs the same file to the metrics package and the web app. Everything in it is derived from
the OBJ geometry (mirrored pairs, symmetry regions, skin zones), so nothing is hand-indexed
except the three contour lists MediaPipe itself publishes (eye, eyebrow, lips).
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OBJ = ROOT / "packages/metrics/third_party/mediapipe/canonical_face_model.obj"
OUTPUTS = [
    ROOT / "packages/metrics/facet_metrics/data/canonical_face.json",
    ROOT / "apps/web/src/lib/face/canonical.json",
]

# Subject's right side (negative x in the canonical model). Left partners come from mirroring.
RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
RIGHT_BROW = [46, 53, 52, 65, 55, 70, 63, 105, 66, 107]
LIPS = [
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 185, 40, 39, 37, 0, 267, 269, 270, 409,
    78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 191, 80, 81, 82, 13, 312, 311, 310, 415,
]  # fmt: skip
RIGHT_JAW = [132, 58, 172, 136, 150, 149, 176, 148]


def main() -> None:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    for line in OBJ.read_text().splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "v":
            vertices.append((float(parts[1]), float(parts[2]), float(parts[3])))
        elif parts[0] == "f":
            a, b, c = (int(token.split("/")[0]) - 1 for token in parts[1:4])
            faces.append((a, b, c))
    assert len(vertices) == 468, len(vertices)

    midline = sorted((i for i, v in enumerate(vertices) if abs(v[0]) < 1e-6), key=lambda i: -vertices[i][1])
    pairs: list[tuple[int, int, str]] = []
    for r, (x, y, z) in enumerate(vertices):
        if x >= -1e-6:
            continue
        left = min(
            range(len(vertices)),
            key=lambda j: (vertices[j][0] + x) ** 2 + (vertices[j][1] - y) ** 2 + (vertices[j][2] - z) ** 2,
        )
        lx, ly, lz = vertices[left]
        assert abs(lx + x) < 1e-5 and abs(ly - y) < 1e-5 and abs(lz - z) < 1e-5, (r, left)
        pairs.append((r, left, region_of(r, x, y, z)))

    def zone(predicate) -> list[int]:
        picked = []
        for index, (a, b, c) in enumerate(faces):
            cx = (vertices[a][0] + vertices[b][0] + vertices[c][0]) / 3
            cy = (vertices[a][1] + vertices[b][1] + vertices[c][1]) / 3
            if predicate(cx, cy):
                picked.append(index)
        return picked

    zones = {
        "forehead": zone(lambda x, y: 5.6 <= y <= 8.0 and abs(x) <= 4.5),
        "cheek_r": zone(lambda x, y: -6.0 <= x <= -2.4 and -3.2 <= y <= 0.9),
        "cheek_l": zone(lambda x, y: 2.4 <= x <= 6.0 and -3.2 <= y <= 0.9),
        "nose": zone(lambda x, y: abs(x) <= 1.4 and -1.4 <= y <= 2.6),
        "chin": zone(lambda x, y: abs(x) <= 2.4 and -8.6 <= y <= -6.3),
        "under_eye_r": zone(lambda x, y: -4.3 <= x <= -1.9 and 1.0 <= y <= 2.0),
        "under_eye_l": zone(lambda x, y: 1.9 <= x <= 4.3 and 1.0 <= y <= 2.0),
    }
    for name, members in zones.items():
        assert members, f"empty zone {name}"

    # Vertices used to fit head pose: the upper face, which does not move with the jaw or lips.
    rigid = [i for i, v in enumerate(vertices) if v[1] >= -2.6]

    data = {
        "source": "MediaPipe canonical_face_model.obj (Apache-2.0)",
        "vertices": [[round(c, 6) for c in v] for v in vertices],
        "faces": [list(f) for f in faces],
        "midline": midline,
        "pairs": [list(p) for p in pairs],
        "rigid": rigid,
        "zones": zones,
    }
    text = json.dumps(data, separators=(",", ":"))
    for out in OUTPUTS:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text + "\n")
    counts: dict[str, int] = {}
    for _, _, region in pairs:
        counts[region] = counts.get(region, 0) + 1
    print(f"{len(vertices)} vertices, {len(faces)} faces, {len(pairs)} pairs, {len(rigid)} rigid")
    print("regions", counts)
    print("zones", {k: len(v) for k, v in zones.items()})


def region_of(r: int, x: float, y: float, z: float) -> str:
    if r in RIGHT_EYE:
        return "eyes"
    if r in RIGHT_BROW:
        return "brows"
    if r in LIPS:
        return "mouth"
    if r in RIGHT_JAW or y < -5.6:
        return "jaw"
    if abs(x) <= 2.1 and -2.4 <= y <= 2.2 and z >= 4.3:
        return "nose"
    if -5.6 <= y <= 1.8 and 2.1 < abs(x) <= 6.6:
        return "cheeks"
    return "other"


if __name__ == "__main__":
    main()
