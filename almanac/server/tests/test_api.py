from fastapi.testclient import TestClient

from tests.conftest import BASE, TOKEN

WS = "ws://127.0.0.1:8765"


def test_requires_token(app):
    with TestClient(app, base_url=BASE) as c:
        assert c.get("/v1/session").status_code == 401
        assert c.get("/v1/session", headers={"X-Almanac-Token": "nope"}).status_code == 401
        assert c.get("/v1/session", headers={"X-Almanac-Token": TOKEN}).status_code == 200


def test_rejects_foreign_host_and_origin(app):
    with TestClient(
        app, base_url="http://evil.example:8765", headers={"X-Almanac-Token": TOKEN}
    ) as c:
        assert c.get("/v1/session").status_code == 403  # DNS rebinding
    with TestClient(app, base_url=BASE, headers={"X-Almanac-Token": TOKEN}) as c:
        r = c.get("/v1/session", headers={"Origin": "https://evil.example"})
        assert r.status_code == 403
        r = c.get("/v1/session", headers={"Origin": BASE})
        assert r.status_code == 200


def test_openapi_docs_served(client):
    assert client.get("/openapi.json").json()["info"]["title"] == "Almanac local API"


def test_resolve_exact_and_aliases(client):
    r = client.get("/v1/resolve", params={"q": "AAPL US EQUITY"}).json()
    assert r["exact"]["id"] == "EQUITY:US:AAPL"
    r = client.get("/v1/resolve", params={"q": "aapl us eq"}).json()
    assert r["exact"]["id"] == "EQUITY:US:AAPL"
    r = client.get("/v1/resolve", params={"q": "VOD LN EQUITY"}).json()
    assert r["exact"]["id"] == "EQUITY:XLON:VOD"
    r = client.get("/v1/resolve", params={"q": "US GOVT"}).json()
    assert r["exact"]["id"] == "CURVE:US:UST_PAR"
    r = client.get("/v1/resolve", params={"q": "EURUSD FX"}).json()
    assert r["exact"]["id"] == "CURNCY:FX:EURUSD"


def test_resolve_search_lists_matches(client):
    r = client.get("/v1/resolve", params={"q": "apple"}).json()
    assert r["exact"] is None
    assert r["matches"][0]["id"] == "EQUITY:US:AAPL"


def test_resolve_unsourced_sector(client):
    r = client.get("/v1/resolve", params={"q": "ABC MUNI"}).json()
    assert r["exact"] is None and "no source is configured" in r["message"]


def test_ref_desc_fields_filled_in_demo(client):
    fields = [
        "ref.name",
        "ref.description",
        "px.last",
        "px.chg",
        "px.chg_pct",
        "px.hi_52w",
        "px.lo_52w",
        "val.mkt_cap",
        "val.pe_ttm",
        "val.div_yield",
        "fin.shares_out",
    ]
    r = client.post("/v1/ref", json={"ids": ["EQUITY:US:AAPL"], "fields": fields}).json()
    vals = r["values"]["EQUITY:US:AAPL"]
    for f in fields:
        assert "value" in vals[f], (f, vals[f])
        assert vals[f]["prov"]["provider"] == "demo"
    last = vals["px.last"]["value"]
    shares = vals["fin.shares_out"]["value"]
    assert abs(vals["val.mkt_cap"]["value"] - last * shares) < 1e-6 * last * shares
    assert vals["px.lo_52w"]["value"] <= last <= vals["px.hi_52w"]["value"]


def test_ref_missing_value_is_unavailable_with_reason(client):
    r = client.post(
        "/v1/ref", json={"ids": ["EQUITY:US:AAPL"], "fields": ["ref.figi", "nope.field"]}
    ).json()
    vals = r["values"]["EQUITY:US:AAPL"]
    assert vals["ref.figi"]["unavailable"] is True
    assert "demo does not supply ref.figi" in vals["ref.figi"]["reasons"][0]
    assert vals["nope.field"]["reasons"] == ["Unknown field nope.field"]


def test_ref_with_no_provider(tmp_path):
    from almanac.api.app import create_app
    from almanac.config import Settings
    from almanac.store.db import Store

    app = create_app(Settings(home=tmp_path, mode="live"), token=TOKEN, store=Store(":memory:"))
    with TestClient(app, base_url=BASE, headers={"X-Almanac-Token": TOKEN}) as c:
        r = c.post("/v1/ref", json={"ids": ["EQUITY:US:AAPL"], "fields": ["px.last"]}).json()
        reason = r["values"]["EQUITY:US:AAPL"]["px.last"]["reasons"][0]
        assert reason == "No provider configured for px.last on EQUITY"


def test_hist_period_and_freq(client):
    r = client.post(
        "/v1/hist",
        json={
            "id": "EQUITY:US:AAPL",
            "fields": ["px.open", "px.high", "px.low", "px.close", "px.volume"],
            "period": "1Y",
        },
    ).json()
    series = {s["field"]: s for s in r["series"]}
    assert set(series) == {"px.open", "px.high", "px.low", "px.close", "px.volume"}
    pts = series["px.close"]["points"]
    assert 245 <= len(pts) <= 265
    assert series["px.close"]["freq"] == "1d"
    assert pts[-1]["ts"].startswith("2026-09-30")
    r = client.post(
        "/v1/hist", json={"id": "EQUITY:US:AAPL", "fields": ["px.close"], "period": "1D"}
    ).json()
    s = r["series"][0]
    assert s["freq"] == "5m"
    # 09:30 to 14:00 New York on the fixed clock: 54 five-minute bars have started
    assert len(s["points"]) == 55


def test_hist_currency_conversion(client):
    usd = client.post(
        "/v1/hist", json={"id": "EQUITY:US:AAPL", "fields": ["px.close"], "period": "1M"}
    ).json()["series"][0]
    eur = client.post(
        "/v1/hist",
        json={"id": "EQUITY:US:AAPL", "fields": ["px.close"], "period": "1M", "ccy": "EUR"},
    ).json()["series"][0]
    fx = client.post(
        "/v1/hist", json={"id": "CURNCY:FX:EURUSD", "fields": ["px.close"], "period": "1M"}
    ).json()["series"][0]
    assert eur["currency"] == "EUR"
    rate = {p["ts"]: p["value"] for p in fx["points"]}
    for u, e in zip(usd["points"], eur["points"], strict=True):
        assert abs(e["value"] - u["value"] / rate[u["ts"]]) < 1e-9 * u["value"]


def test_bulk_filings(client):
    r = client.post(
        "/v1/bulk",
        json={
            "id": "EQUITY:US:AAPL",
            "field": "bulk.filings",
            "params": {"form": "10-K,10-Q", "limit": 5},
        },
    ).json()
    rows = r["table"]["rows"]
    assert len(rows) == 5
    assert {row["form"] for row in rows} <= {"10-K", "10-Q"}
    assert rows == sorted(rows, key=lambda x: x["filed"], reverse=True)
    r = client.post("/v1/bulk", json={"id": "CURNCY:FX:EURUSD", "field": "bulk.filings"}).json()
    assert r["unavailable"]["reasons"]


def test_fields_search(client):
    names = [f["name"] for f in client.get("/v1/fields", params={"q": "52"}).json()]
    assert names == ["px.hi_52w", "px.lo_52w"]
    assert len(client.get("/v1/fields").json()) > 30


def test_state_roundtrip_and_history(client):
    client.put("/v1/state/watchlists", json={"key": "core", "value": ["EQUITY:US:AAPL"]})
    assert client.get("/v1/state/watchlists").json() == {"core": ["EQUITY:US:AAPL"]}
    client.delete("/v1/state/watchlists/core")
    assert client.get("/v1/state/watchlists").json() == {}
    assert client.get("/v1/state/bogus").status_code == 404
    for i in range(55):
        client.post("/v1/state/history", json={"panel": "1", "command": f"CMD {i}"})
    h = client.get("/v1/state/history").json()
    assert len(h) == 50 and h[0]["command"] == "CMD 54"


def test_history_survives_restart(tmp_path):
    from almanac.api.app import create_app
    from almanac.config import Settings
    from almanac.store.db import Store

    s = Settings(home=tmp_path, mode="demo")
    for _ in range(2):
        app = create_app(s, token=TOKEN, store=Store(s.db_path))
        with TestClient(app, base_url=BASE, headers={"X-Almanac-Token": TOKEN}) as c:
            c.post("/v1/state/history", json={"panel": "2", "command": "DESC"})
    app = create_app(s, token=TOKEN, store=Store(s.db_path))
    with TestClient(app, base_url=BASE, headers={"X-Almanac-Token": TOKEN}) as c:
        assert len(c.get("/v1/state/history").json()) == 2


def test_stream_requires_token(app):
    import pytest
    from starlette.websockets import WebSocketDisconnect

    with (
        TestClient(app, base_url=BASE) as c,
        pytest.raises(WebSocketDisconnect),
        c.websocket_connect(f"{WS}/v1/stream?token=wrong") as ws,
    ):
        ws.receive_json()


def test_stream_sub_ack_tick_pong(app):
    with (
        TestClient(app, base_url=BASE) as c,
        c.websocket_connect(f"{WS}/v1/stream?token={TOKEN}") as ws,
    ):
        ws.send_json(
            {
                "op": "sub",
                "req": 7,
                "ids": ["EQUITY:US:AAPL"],
                "fields": ["px.last", "px.bid", "px.ask"],
            }
        )
        ack = ws.receive_json()
        assert ack == {"op": "ack", "req": 7, "mode": {"EQUITY:US:AAPL": "demo"}}
        tick = ws.receive_json()
        assert tick["op"] == "tick" and tick["id"] == "EQUITY:US:AAPL"
        assert set(tick["v"]) == {"px.last", "px.bid", "px.ask"}
        assert tick["v"]["px.bid"] < tick["v"]["px.ask"]
        ws.send_json({"op": "unsub", "req": 8, "ids": ["EQUITY:US:AAPL"]})
        ws.send_json({"op": "ping", "t": 123})
        msg = {}
        for _ in range(20):  # ticks already in flight may arrive first
            msg = ws.receive_json()
            if msg["op"] == "pong":
                break
        assert msg == {"op": "pong", "t": 123}


def test_aliases_toml_is_served(settings, app, client):
    (settings.home / "aliases.toml").write_text(
        '[functions]\nPX = "CHRT"\n\n[sectors]\nSTK = "EQUITY"\n\n[securities]\nOIL = "WTI CMDTY"\n'
    )
    got = client.get("/v1/state/aliases").json()
    assert got == {
        "functions": {"PX": "CHRT"},
        "sectors": {"STK": "EQUITY"},
        "securities": {"OIL": "WTI CMDTY"},
    }
