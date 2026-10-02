"""Field registry: Almanac's own dotted field names, their units, shapes and capability.

Families: px. prices, ref. reference, fin. reported financials, val. valuation,
econ. economic observations, bulk. tables.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

Shape = Literal["reference", "history", "bulk", "stream"]


class FieldDef(BaseModel):
    name: str
    unit: str
    shapes: list[Shape]
    meaning: str
    source: str  # where Phase 1 gets it
    computed: bool = False  # derived by the router from other fields


def _f(name: str, unit: str, shapes: list[Shape], meaning: str, source: str, computed=False):
    return FieldDef(
        name=name, unit=unit, shapes=shapes, meaning=meaning, source=source, computed=computed
    )


FIELDS: list[FieldDef] = [
    _f(
        "px.last",
        "price",
        ["reference", "stream"],
        "Last trade or latest close",
        "Price provider or demo",
    ),
    _f("px.open", "price", ["history"], "Bar open", "Price provider or demo"),
    _f("px.high", "price", ["history"], "Bar high", "Price provider or demo"),
    _f("px.low", "price", ["history"], "Bar low", "Price provider or demo"),
    _f("px.close", "price", ["history"], "Bar close", "Price provider or demo"),
    _f(
        "px.volume",
        "shares",
        ["reference", "history", "stream"],
        "Traded volume",
        "Price provider or demo",
    ),
    _f("px.bid", "price", ["stream"], "Best bid", "Streaming provider"),
    _f("px.ask", "price", ["stream"], "Best ask", "Streaming provider"),
    _f(
        "px.chg",
        "price",
        ["reference", "stream"],
        "Change from previous close",
        "Computed",
        computed=True,
    ),
    _f(
        "px.chg_pct",
        "%",
        ["reference", "stream"],
        "Percent change from previous close",
        "Computed",
        computed=True,
    ),
    _f("px.hi_52w", "price", ["reference"], "52-week high", "Computed from history", computed=True),
    _f("px.lo_52w", "price", ["reference"], "52-week low", "Computed from history", computed=True),
    _f("ref.name", "text", ["reference"], "Instrument name", "Symbol master"),
    _f("ref.currency", "text", ["reference"], "Trading currency (ISO 4217)", "Symbol master"),
    _f("ref.country", "text", ["reference"], "Country (ISO 3166-1 alpha-2)", "Symbol master"),
    _f("ref.mic", "text", ["reference"], "Exchange (ISO 10383 MIC)", "Symbol master"),
    _f("ref.sic", "text", ["reference"], "SEC industry code", "SEC"),
    _f("ref.industry", "text", ["reference"], "SEC industry title", "SEC"),
    _f(
        "ref.description",
        "text",
        ["reference"],
        "Business description",
        "Provider that supplies one, else the 10-K",
    ),
    _f("ref.cik", "text", ["reference"], "SEC Central Index Key", "SEC"),
    _f("ref.figi", "text", ["reference"], "Financial Instrument Global Identifier", "OpenFIGI"),
    _f(
        "fin.shares_out",
        "shares",
        ["reference", "history"],
        "Shares outstanding from the cover page",
        "SEC XBRL",
    ),
    _f("fin.revenue", "currency", ["history"], "Revenue", "SEC XBRL"),
    _f("fin.net_income", "currency", ["history"], "Net income", "SEC XBRL"),
    _f("fin.eps_diluted", "currency", ["history"], "Diluted EPS", "SEC XBRL"),
    _f("fin.assets", "currency", ["history"], "Total assets", "SEC XBRL"),
    _f("fin.liabilities", "currency", ["history"], "Total liabilities", "SEC XBRL"),
    _f("fin.equity", "currency", ["history"], "Shareholders' equity", "SEC XBRL"),
    _f("fin.cfo", "currency", ["history"], "Cash from operations", "SEC XBRL"),
    _f("fin.capex", "currency", ["history"], "Capital expenditure", "SEC XBRL"),
    _f(
        "val.mkt_cap",
        "currency",
        ["reference"],
        "px.last x fin.shares_out",
        "Computed",
        computed=True,
    ),
    _f(
        "val.pe_ttm",
        "ratio",
        ["reference"],
        "Price over trailing twelve-month diluted EPS",
        "Computed",
        computed=True,
    ),
    _f(
        "val.div_yield",
        "%",
        ["reference"],
        "Trailing twelve-month dividends over price",
        "Computed",
        computed=True,
    ),
    _f(
        "econ.value",
        "series unit",
        ["history"],
        "One observation of an economic series",
        "FRED, EIA",
    ),
    _f(
        "bulk.filings", "table", ["bulk"], "Form, filed date, period, accession number, link", "SEC"
    ),
    _f(
        "bulk.statements",
        "table",
        ["bulk"],
        "Standardized statements with as-reported concepts",
        "SEC XBRL",
    ),
    _f("bulk.news", "table", ["bulk"], "Headlines for an instrument or topic", "News providers"),
    _f("bulk.curve", "table", ["bulk"], "Tenor, years, yield", "U.S. Treasury"),
]

REGISTRY: dict[str, FieldDef] = {f.name: f for f in FIELDS}

# Inputs to computed fields. Providers may supply them, but they are not part of the
# public field list (see docs/DECISIONS.md, D-004).
INTERNAL_FIELDS: dict[str, FieldDef] = {
    f.name: f
    for f in [
        _f("px.prev_close", "price", ["reference"], "Previous session close", "Price provider"),
        _f(
            "fin.eps_ttm",
            "currency",
            ["reference"],
            "Trailing twelve-month diluted EPS",
            "SEC XBRL",
        ),
        _f(
            "fin.dps_ttm",
            "currency",
            ["reference"],
            "Trailing twelve-month dividends per share",
            "Price provider",
        ),
    ]
}

# Inputs each computed field needs; the router fetches these and derives the result.
COMPUTED_INPUTS: dict[str, list[str]] = {
    "px.chg": ["px.last", "px.prev_close"],
    "px.chg_pct": ["px.last", "px.prev_close"],
    "px.hi_52w": ["px.close@history"],
    "px.lo_52w": ["px.close@history"],
    "val.mkt_cap": ["px.last", "fin.shares_out"],
    "val.pe_ttm": ["px.last", "fin.eps_ttm"],
    "val.div_yield": ["px.last", "fin.dps_ttm"],
}


def get(name: str) -> FieldDef | None:
    return REGISTRY.get(name) or INTERNAL_FIELDS.get(name)


def search(q: str) -> list[FieldDef]:
    q = q.strip().lower()
    if not q:
        return list(FIELDS)
    return [f for f in FIELDS if q in f.name.lower() or q in f.meaning.lower()]


def capability(field: str, shape: Shape, asset_class: str) -> str:
    """Capability string a provider must declare to answer a field: {shape}:{class}[:{detail}]."""
    if shape == "bulk":
        return f"bulk:{asset_class}:{field.removeprefix('bulk.')}"
    return f"{shape}:{asset_class}"
