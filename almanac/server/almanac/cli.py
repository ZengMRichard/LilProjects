"""The `almanac` command: start, demo, doctor, openapi."""

from __future__ import annotations

import argparse
import asyncio
import os
import secrets
import sys
import threading
import webbrowser
from pathlib import Path

NOTICE = "Data may be delayed or wrong. Nothing in Almanac is investment advice."


def _serve(mode: str | None, open_browser: bool) -> int:
    import uvicorn

    from almanac.api.app import create_app
    from almanac.config import WEB_DIST, load

    if mode:
        os.environ["ALMANAC_MODE"] = mode
    settings = load()
    token = os.environ.get("ALMANAC_TOKEN") or secrets.token_urlsafe(24)
    app = create_app(settings, token=token)
    url = f"http://127.0.0.1:{settings.port}/#token={token}"
    print(f"Almanac {settings.mode} mode on http://127.0.0.1:{settings.port}")
    print(NOTICE)
    if not (WEB_DIST / "index.html").exists():
        print("The web app is not built yet: run `pnpm install && pnpm -C apps/web build`.")
    print(f"Open: {url}")
    if open_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    uvicorn.run(app, host="127.0.0.1", port=settings.port, log_level="warning")
    return 0


def _doctor(net: bool) -> int:
    from almanac.api.app import Services
    from almanac.config import load
    from almanac.store.db import Store

    settings = load()
    print(f"home:   {settings.home}")
    print(f"mode:   {settings.mode}")
    print(f"port:   {settings.port}")
    ok = True
    try:
        store = Store(settings.db_path)
        svc = Services(settings, store)
        n = len(svc.master.all())
        print(
            f"store:  ok ({n} symbols, schema v"
            f"{store.conn.execute('PRAGMA user_version').fetchone()[0]})"
        )
    except Exception as e:  # pragma: no cover - diagnostic path
        print(f"store:  FAILED {e}")
        return 1
    providers = svc.router.providers
    if not providers:
        print("providers: none configured; run `almanac demo` to explore on demo data")
    for p in providers:
        h = asyncio.run(p.health())
        ok &= h.ok
        key = "key not needed" if not p.requires_key else "key required"
        print(f"provider {p.name}: {'ok' if h.ok else 'FAILED'} ({h.detail}; {key})")
    if net:
        hosts = sorted({h for p in providers for h in p.hosts})
        print("allowed outbound hosts:", ", ".join(hosts) if hosts else "none")
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="almanac", description="Keyboard-first financial terminal")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("start", help="start the server and open the browser")
    s.add_argument("--no-browser", action="store_true")
    d = sub.add_parser("demo", help="start restricted to the demo provider")
    d.add_argument("--no-browser", action="store_true")
    doc = sub.add_parser("doctor", help="check keys, connectivity and store health")
    doc.add_argument("--net", action="store_true", help="print allowed outbound hosts")
    o = sub.add_parser("openapi", help="write the OpenAPI schema (for web type generation)")
    o.add_argument("path", type=Path)
    k = sub.add_parser("keys", help="manage provider API keys (Phase 1)")
    k.add_argument("action", choices=["set"])
    k.add_argument("provider")
    args = ap.parse_args(argv)

    if args.cmd == "start":
        return _serve(None, not args.no_browser)
    if args.cmd == "demo":
        return _serve("demo", not args.no_browser)
    if args.cmd == "doctor":
        return _doctor(args.net)
    if args.cmd == "openapi":
        from almanac.api.app import write_openapi

        write_openapi(args.path)
        return 0
    if args.cmd == "keys":
        print(
            "No live providers ship in Phase 0, so there are no keys to set yet.", file=sys.stderr
        )
        return 2
    return 1


if __name__ == "__main__":
    sys.exit(main())
