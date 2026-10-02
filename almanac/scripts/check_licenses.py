"""Fails when an installed Python distribution's license is outside the allowlist.

Allowed: MIT, BSD, ISC, Apache-2.0, MPL-2.0, public domain. Approved exceptions live in
scripts/license-exceptions.json with a reason each.
"""

import json
import re
import sys
from importlib.metadata import distributions
from pathlib import Path

ALLOW = re.compile(
    r"^(MIT|ISC|0BSD|BSD|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|Apache Software License|"
    r"Apache 2\.0|MPL-2\.0|Mozilla Public License 2\.0 MPL 2\.0|CC0-1\.0|Unlicense|"
    r"MIT License|BSD License|ISC License \(ISCL\)|Public Domain)$",
    re.I,
)
ROOT = Path(__file__).resolve().parents[1]
_EXCEPTIONS_FILE = ROOT / "scripts" / "license-exceptions.json"
EXCEPTIONS = json.loads(_EXCEPTIONS_FILE.read_text()).get("python", {})


def licenses(dist) -> list[str]:
    meta = dist.metadata
    if expr := meta.get("License-Expression"):
        return [expr]
    classifiers = [
        c.split(" :: ")[-1] for c in meta.get_all("Classifier") or [] if c.startswith("License ::")
    ]
    if classifiers:
        return classifiers
    lic = (meta.get("License") or "").strip()
    return [lic.splitlines()[0]] if lic else []


def allowed(exprs: list[str]) -> bool:
    if not exprs:
        return False
    for expr in exprs:
        alts = re.split(r"\s+OR\s+", expr.replace("(", "").replace(")", ""))
        if any(all(ALLOW.match(p.strip()) for p in re.split(r"\s+AND\s+", a)) for a in alts):
            return True
    return False


def main() -> int:
    bad = []
    dists = list(distributions())
    for d in dists:
        name = d.metadata["Name"]
        if name.lower() == "almanac":
            continue
        if name in EXCEPTIONS or name.lower() in EXCEPTIONS:
            e = EXCEPTIONS.get(name) or EXCEPTIONS[name.lower()]
            print(f"warning: {name} ({e['license']}) is an exception: {e['status']}")
            continue
        lic = licenses(d)
        if not allowed(lic):
            bad.append(f"not allowed: {name} ({'; '.join(lic) or 'no license metadata'})")
    print(f"checked {len(dists)} python distributions")
    for b in bad:
        print(b, file=sys.stderr)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
