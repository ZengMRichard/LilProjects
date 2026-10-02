"""Local REST and WebSocket API. Binds to 127.0.0.1 only.

Every /v1 request needs the session token as X-Almanac-Token (the WebSocket takes it as a
query parameter, since browsers cannot set WebSocket headers). Host and Origin are checked
too, which blocks other web pages and DNS-rebinding attacks from reaching the server.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import random
import secrets
from datetime import UTC, date
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

import almanac
from almanac.config import DEMO_DIR, WEB_DIST, Settings
from almanac.core import fields as F
from almanac.core.models import Instrument, Series, Table, Unavailable, Value
from almanac.core.resolver import Resolution, resolve
from almanac.core.router import Router
from almanac.core.symbols import SymbolMaster, load_demo_instruments
from almanac.providers.demo import DemoProvider
from almanac.store.db import Store

STATE_KINDS = {"watchlists", "workspaces", "aliases", "settings", "alerts"}


# -- request and response bodies --------------------------------------------------------------


class RefRequest(BaseModel):
    ids: list[str]
    fields: list[str]
    overrides: dict[str, str] = Field(default_factory=dict)


class RefResponse(BaseModel):
    values: dict[str, dict[str, Value | Unavailable]]


class HistRequest(BaseModel):
    id: str
    fields: list[str]
    start: date | None = None
    end: date | None = None
    period: str | None = None
    freq: str | None = None
    adjusted: bool = True
    ccy: str | None = None


class HistResponse(BaseModel):
    series: list[Series] = Field(default_factory=list)
    unavailable: Unavailable | None = None


class BulkRequest(BaseModel):
    id: str
    field: str
    params: dict[str, Any] = Field(default_factory=dict)


class BulkResponse(BaseModel):
    table: Table | None = None
    unavailable: Unavailable | None = None


class ProviderInfo(BaseModel):
    name: str
    title: str
    terms_url: str
    attribution: str | None
    requires_key: bool
    capabilities: list[str]
    ok: bool
    detail: str
    budget_left_pct: float | None = None


class SessionInfo(BaseModel):
    version: str
    mode: Literal["live", "demo"]
    clocks: list[str]
    providers: list[str]


class StatePut(BaseModel):
    key: str
    value: Any


class HistoryEntry(BaseModel):
    ts: str
    panel: str
    command: str


class HistoryPost(BaseModel):
    panel: str
    command: str


# -- app ----------------------------------------------------------------------------------------


class Services:
    def __init__(self, settings: Settings, store: Store, clock=None):
        self.settings = settings
        self.store = store
        self.master = SymbolMaster(store)
        instruments, raw = load_demo_instruments(DEMO_DIR / "instruments.json")
        self.master.seed(instruments)
        self.demo = DemoProvider(instruments, raw, clock=clock)
        # Phase 0 ships one provider. Live adapters register here from Phase 1; in demo mode
        # only the demo provider is consulted.
        providers: list = [self.demo] if settings.mode == "demo" else []
        self.router = Router(providers, self.master, settings.priority, clock=clock)


def create_app(
    settings: Settings, token: str | None = None, store: Store | None = None, clock=None
) -> FastAPI:
    token = token or secrets.token_urlsafe(24)
    store = store or Store(settings.db_path)
    svc = Services(settings, store, clock=clock)
    app = FastAPI(
        title="Almanac local API",
        version=almanac.__version__,
        docs_url="/docs",
        openapi_url="/openapi.json",
    )
    app.state.token = token
    app.state.svc = svc

    allowed_hosts = settings.allowed_hosts

    @app.middleware("http")
    async def guard(request: Request, call_next):
        host = request.headers.get("host", "")
        if host not in allowed_hosts:
            return JSONResponse({"detail": "Host not allowed"}, status_code=403)
        origin = request.headers.get("origin")
        if origin and origin not in settings.allowed_origins:
            return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
        if request.url.path.startswith("/v1/") and not secrets.compare_digest(
            request.headers.get("x-almanac-token", ""), token
        ):
            return JSONResponse({"detail": "Missing or wrong session token"}, status_code=401)
        return await call_next(request)

    # -- reference data -----------------------------------------------------------------------

    @app.get("/v1/session", response_model=SessionInfo)
    async def session() -> SessionInfo:
        return SessionInfo(
            version=almanac.__version__,
            mode=settings.mode,  # type: ignore[arg-type]
            clocks=settings.clocks,
            providers=[p.name for p in svc.router.providers],
        )

    @app.get("/v1/resolve", response_model=Resolution)
    async def resolve_(q: str = Query(..., description="Typed security or search text")):
        return resolve(svc.master, q)

    @app.get("/v1/symbols", response_model=list[Instrument])
    async def symbols() -> list[Instrument]:
        """The whole symbol master, so the browser can autocomplete without the network."""
        return svc.master.all()

    @app.post("/v1/ref", response_model=RefResponse)
    async def ref(req: RefRequest) -> RefResponse:
        return RefResponse(values=await svc.router.reference(req.ids, req.fields))

    @app.post("/v1/hist", response_model=HistResponse)
    async def hist(req: HistRequest) -> HistResponse:
        out = await svc.router.history(
            req.id, req.fields, req.start, req.end, req.freq, req.adjusted, req.ccy, req.period
        )
        if isinstance(out, Unavailable):
            return HistResponse(unavailable=out)
        return HistResponse(series=out)

    @app.post("/v1/bulk", response_model=BulkResponse)
    async def bulk(req: BulkRequest) -> BulkResponse:
        out = await svc.router.bulk(req.id, req.field, req.params)
        if isinstance(out, Unavailable):
            return BulkResponse(unavailable=out)
        return BulkResponse(table=out)

    @app.get("/v1/fields", response_model=list[F.FieldDef])
    async def fields_(q: str = "") -> list[F.FieldDef]:
        return F.search(q)

    @app.get("/v1/providers", response_model=list[ProviderInfo])
    async def providers() -> list[ProviderInfo]:
        out = []
        for p in svc.router.providers:
            h = await p.health()
            out.append(
                ProviderInfo(
                    name=p.name,
                    title=p.title,
                    terms_url=p.terms_url,
                    attribution=p.attribution,
                    requires_key=p.requires_key,
                    capabilities=sorted(p.capabilities),
                    ok=h.ok,
                    detail=h.detail,
                )
            )
        return out

    # -- local state --------------------------------------------------------------------------

    @app.get("/v1/state/history", response_model=list[HistoryEntry])
    async def get_history(limit: int = 50) -> list[HistoryEntry]:
        return [HistoryEntry(**h) for h in store.history(min(limit, 500))]

    @app.post("/v1/state/history", response_model=HistoryEntry)
    async def post_history(entry: HistoryPost) -> HistoryEntry:
        store.add_history(entry.panel, entry.command)
        return HistoryEntry(**store.history(1)[0])

    @app.get("/v1/state/{kind}", response_model=dict[str, Any])
    async def get_state(kind: str) -> dict[str, Any]:
        _check_kind(kind)
        state = store.get_state(kind)
        if kind == "aliases":
            # ~/.almanac/aliases.toml is the user's file; its sections win over stored ones.
            state |= load_aliases(settings.home / "aliases.toml")
        return state

    @app.put("/v1/state/{kind}", response_model=dict[str, Any])
    async def put_state(kind: str, body: StatePut) -> dict[str, Any]:
        _check_kind(kind)
        store.put_state(kind, body.key, body.value)
        return store.get_state(kind)

    @app.delete("/v1/state/{kind}/{key}", response_model=dict[str, Any])
    async def delete_state(kind: str, key: str) -> dict[str, Any]:
        _check_kind(kind)
        store.delete_state(kind, key)
        return store.get_state(kind)

    # -- stream -------------------------------------------------------------------------------

    @app.websocket("/v1/stream")
    async def stream(ws: WebSocket):
        host = ws.headers.get("host", "")
        origin = ws.headers.get("origin")
        if (
            host not in allowed_hosts
            or (origin and origin not in settings.allowed_origins)
            or not secrets.compare_digest(ws.query_params.get("token", ""), token)
        ):
            await ws.close(code=4401)
            return
        await ws.accept()
        await StreamSession(ws, svc).run()

    # -- web app ------------------------------------------------------------------------------

    dist = WEB_DIST

    @app.get("/{path:path}", include_in_schema=False)
    async def web(path: str):
        if path.startswith("v1/"):
            raise HTTPException(404)
        f = (dist / path).resolve()
        if path and f.is_file() and dist.resolve() in f.parents:
            return FileResponse(f)
        index = dist / "index.html"
        if index.exists():
            return FileResponse(index)
        return JSONResponse(
            {
                "detail": "Web app not built. Run `pnpm -C apps/web build`, or use the dev "
                "server with `pnpm -C apps/web dev`."
            },
            status_code=404,
        )

    return app


def load_aliases(path: Path) -> dict[str, dict[str, str]]:
    """Read [functions], [sectors] and [securities] tables of personal shortcuts."""
    if not path.exists():
        return {}
    import tomllib

    try:
        data = tomllib.loads(path.read_text())
    except tomllib.TOMLDecodeError:
        return {}
    return {
        section: {str(k).upper(): str(v) for k, v in data.get(section, {}).items()}
        for section in ("functions", "sectors", "securities")
        if isinstance(data.get(section), dict)
    }


def _check_kind(kind: str) -> None:
    if kind not in STATE_KINDS:
        raise HTTPException(404, f"Unknown state kind {kind}; one of {sorted(STATE_KINDS)}")


# -- stream hub ---------------------------------------------------------------------------------

MAX_UPDATES_PER_SECOND = 4
STREAM_FIELDS = {
    "px.last": "last",
    "px.bid": "bid",
    "px.ask": "ask",
    "px.volume": "volume",
    "px.chg": "chg",
    "px.chg_pct": "chg_pct",
}


class StreamSession:
    """One per browser tab. Merges provider streams and polled quotes into subscriptions,
    sending at most four updates per second per instrument; the latest value wins."""

    def __init__(self, ws: WebSocket, svc: Services):
        self.ws = ws
        self.svc = svc
        self.subs: dict[str, set[str]] = {}

    async def run(self) -> None:
        pump = asyncio.create_task(self._pump())
        try:
            while True:
                msg = json.loads(await self.ws.receive_text())
                await self._handle(msg)
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            pump.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await pump

    async def _handle(self, msg: dict[str, Any]) -> None:
        op = msg.get("op")
        if op == "ping":
            await self.ws.send_json({"op": "pong", "t": msg.get("t")})
        elif op == "sub":
            mode: dict[str, str] = {}
            for id in msg.get("ids", []):
                self.subs.setdefault(id, set()).update(msg.get("fields", ["px.last"]))
                inst = self.svc.master.get(id)
                demo_ok = (
                    inst is not None
                    and f"stream:{inst.asset_class.value}" in self.svc.demo.capabilities
                )
                if self.svc.settings.mode == "demo" and demo_ok:
                    mode[id] = "demo"
                else:
                    mode[id] = "unavailable"
                    await self.ws.send_json(
                        {
                            "op": "status",
                            "id": id,
                            "state": "unavailable",
                            "reason": "No streaming or polling provider configured",
                        }
                    )
            await self.ws.send_json({"op": "ack", "req": msg.get("req"), "mode": mode})
        elif op == "unsub":
            for id in msg.get("ids", []):
                self.subs.pop(id, None)
            await self.ws.send_json({"op": "ack", "req": msg.get("req"), "mode": {}})

    async def _pump(self) -> None:
        interval = 1 / MAX_UPDATES_PER_SECOND
        while True:
            await asyncio.sleep(interval)
            if self.svc.settings.mode != "demo":
                continue
            for id, fields in list(self.subs.items()):
                if random.random() < 0.5:  # demo instruments tick about twice a second
                    continue
                q = self.svc.demo.tick(id)
                if q is None:
                    continue
                v = {f: getattr(q, STREAM_FIELDS[f]) for f in fields if f in STREAM_FIELDS}
                await self.ws.send_json(
                    {
                        "op": "tick",
                        "id": id,
                        "ts": q.ts.astimezone(UTC).isoformat().replace("+00:00", "Z"),
                        "v": v,
                        "prov": "demo",
                    }
                )


def write_openapi(path: Path) -> None:
    from almanac.config import load

    app = create_app(load(), token="schema", store=Store(":memory:"))
    path.write_text(json.dumps(app.openapi(), indent=2))
