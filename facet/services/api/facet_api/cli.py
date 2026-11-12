"""Command line: facet serve | purge | openapi."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="facet", description="Facet API and worker")
    commands = parser.add_subparsers(dest="command", required=True)
    serve = commands.add_parser("serve", help="run the API with the in-process worker")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8787)
    commands.add_parser("purge", help="delete every image past its purge_at, then report any overdue")
    openapi = commands.add_parser("openapi", help="write the OpenAPI schema to a file")
    openapi.add_argument("path", type=Path)
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    from facet_api.app import create_app

    if args.command == "serve":
        import uvicorn

        uvicorn.run(create_app(), host=args.host, port=args.port, log_level="info")
        return 0
    if args.command == "openapi":
        args.path.write_text(json.dumps(create_app().openapi(), indent=2))
        return 0
    from facet_api.purge import overdue_images, purge_expired

    app = create_app()
    with app.state.sessions() as db:
        removed = purge_expired(db, app.state.storage)
        overdue = overdue_images(db)
    print(f"deleted {removed} image(s); {overdue} overdue")
    return 1 if overdue else 0


if __name__ == "__main__":
    sys.exit(main())
