"""Core domain models: instrument x field x time, with provenance on every value.

Rules: timestamps are UTC; money carries a currency code; percentages are stored as
percent values (1.5 means 1.5%); a missing value is None with provenance, never zero.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field


class AssetClass(StrEnum):
    EQUITY = "EQUITY"
    INDEX = "INDEX"
    GOVT = "GOVT"
    CORP = "CORP"
    CMDTY = "CMDTY"
    CURNCY = "CURNCY"
    CRYPTO = "CRYPTO"
    ECON = "ECON"
    CURVE = "CURVE"


Freq = Literal["1m", "5m", "15m", "1h", "1d", "1w", "1mo", "1q", "1y"]


class Provenance(BaseModel):
    provider: str  # "sec_edgar", "fred", "demo", ...
    fetched_at: datetime  # UTC
    as_of: datetime | None = None  # market time the value describes
    delay_minutes: int | None = None  # 0 = real-time, None = unknown
    adjusted: bool | None = None  # split and dividend adjustment for prices
    attribution: str | None = None  # text the UI must display


class Instrument(BaseModel):
    id: str  # "EQUITY:US:AAPL"
    asset_class: AssetClass
    symbol: str  # "AAPL"
    display: str  # "AAPL US EQUITY"
    name: str
    currency: str | None = None  # ISO 4217
    mic: str | None = None  # ISO 10383
    country: str | None = None  # ISO 3166-1 alpha-2
    identifiers: dict[str, str] = Field(default_factory=dict)  # figi, cik, isin, ...
    provider_symbols: dict[str, str] = Field(default_factory=dict)  # provider -> its symbol


class Value(BaseModel):
    field: str
    value: float | str | bool | None
    unit: str | None = None
    prov: Provenance


class Unavailable(BaseModel):
    """Returned when no provider can answer; the UI shows a dash and the reasons."""

    field: str
    unavailable: Literal[True] = True
    reasons: list[str]


class Point(BaseModel):
    ts: datetime
    value: float | None


class Series(BaseModel):
    instrument_id: str
    field: str
    freq: Freq
    currency: str | None = None
    points: list[Point]
    prov: Provenance


class Bar(BaseModel):
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None


class Quote(BaseModel):
    instrument_id: str
    ts: datetime
    last: float | None = None
    bid: float | None = None
    ask: float | None = None
    volume: float | None = None
    chg: float | None = None
    chg_pct: float | None = None
    prov: Provenance


class StatementLine(BaseModel):
    key: str  # "fin.revenue"
    label: str  # "Revenue"
    concept: str  # as reported, e.g. "us-gaap:Revenues"
    values: dict[str, float | None]  # "FY2025", "Q2 FY2026" -> value


class NewsItem(BaseModel):
    id: str
    ts: datetime
    headline: str
    source: str
    url: str
    summary: str | None = None
    instrument_ids: list[str] = Field(default_factory=list)
    prov: Provenance


class Release(BaseModel):
    series_id: str
    name: str
    country: str
    period: str
    scheduled: datetime
    actual: float | None = None
    prior: float | None = None
    revised: float | None = None
    consensus: float | None = None  # only when a provider supplies it
    unit: str
    importance: int  # 1 to 3


class CurvePoint(BaseModel):
    tenor: str  # "3M", "10Y"
    years: float
    value: float  # percent


class OptionQuote(BaseModel):  # Phase 3
    symbol: str
    expiry: date
    strike: float
    right: Literal["C", "P"]
    bid: float | None = None
    ask: float | None = None
    last: float | None = None
    iv: float | None = None
    volume: int | None = None
    open_interest: int | None = None


class Table(BaseModel):
    """Result of a bulk request: a table stored in one field."""

    field: str
    columns: list[str]
    units: dict[str, str | None] = Field(default_factory=dict)
    rows: list[dict[str, Any]]
    prov: Provenance
