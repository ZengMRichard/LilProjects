import json
from pathlib import Path

import pytest

from almanac.core.grammar import Aliases, Context, parse

FIXTURES = Path(__file__).resolve().parents[2] / "packages" / "grammar-fixtures"
REGISTRY = json.loads((FIXTURES / "registry.json").read_text())
CASES = json.loads((FIXTURES / "cases.json").read_text())
CTX = Context(codes=set(REGISTRY["codes"]), aliases=Aliases(**REGISTRY["aliases"]))


@pytest.mark.parametrize("case", CASES, ids=[c["input"] or "<empty>" for c in CASES])
def test_fixture(case):
    assert parse(case["input"], CTX) == case["expect"]


def test_quoted_value_keeps_case():
    out = parse('WMON list="Mixed Case"', CTX)
    assert out["named"]["list"] == "Mixed Case"
