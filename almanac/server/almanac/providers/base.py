"""Provider interface. Adding a data source means writing one adapter; no function changes."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import date, datetime
from typing import Protocol

from pydantic import BaseModel

from almanac.core.models import AssetClass, Instrument, Quote, Series, Table, Value


class NotSupported(Exception):
    """Raised by a provider method the provider does not implement."""


class RateLimits(BaseModel):
    per_second: float | None = None
    per_minute: int | None = None
    per_day: int | None = None


class ProviderHealth(BaseModel):
    ok: bool
    detail: str = ""
    checked_at: datetime


class Provider(Protocol):
    name: str  # "fred"
    title: str  # "FRED, Federal Reserve Bank of St. Louis"
    terms_url: str
    attribution: str | None  # shown wherever this provider's data appears
    requires_key: bool
    capabilities: frozenset[str]  # e.g. {"history:ECON", "calendar:ECON"}
    limits: RateLimits  # per-second, per-minute and per-day budgets
    field_map: dict[str, str]  # Almanac field -> provider field
    hosts: list[str]  # the only hosts this adapter may call

    async def search(self, text: str, asset_class: AssetClass | None) -> list[Instrument]: ...

    async def reference(self, ids: list[str], fields: list[str]) -> dict[str, list[Value]]: ...

    async def history(
        self,
        id: str,
        fields: list[str],
        start: date,
        end: date,
        freq: str,
        adjusted: bool = True,
    ) -> list[Series]: ...

    async def bulk(self, id: str, field: str, params: dict[str, str]) -> Table: ...

    def stream(self, ids: list[str], fields: list[str]) -> AsyncIterator[Quote]: ...

    async def health(self) -> ProviderHealth: ...
