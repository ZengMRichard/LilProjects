# Almanac

Open-source, keyboard-first financial terminal: a local Python server plus a TypeScript web app.
Spec: docs/SPEC.md (the build spec). Build log: docs/PROGRESS.md. Decisions: docs/DECISIONS.md.

## Commands
- Install: `uv sync` (server) and `pnpm install` (web)
- Run on demo data: `pnpm -C apps/web build && uv run almanac demo`
- Run live: `uv run almanac start`
- Dev loop: `ALMANAC_TOKEN=dev ALMANAC_DEV_ORIGINS=http://127.0.0.1:5173 uv run almanac demo --no-browser`
  plus `VITE_ALMANAC_TOKEN=dev pnpm -C apps/web dev`
- Server tests: `uv run pytest -m "not live"`
- Web tests: `pnpm -C apps/web test`
- End-to-end: `pnpm -C apps/web build && pnpm -C apps/web e2e` (set `PW_CHROMIUM` to use a preinstalled Chromium)
- Lint and types: `uv run ruff check . && uv run pyright` and `pnpm -C apps/web check`
- Regenerate API types: `pnpm -C apps/web gen:api`
- Regenerate function docs: `pnpm -C apps/web gen:docs`
- Licenses: `node scripts/check-licenses.mjs && uv run python scripts/check_licenses.py`

## Layout
- server/almanac/{api,core,providers,analytics,store,jobs}
- apps/web/src/{shell,grammar,functions,ui,data}
- packages/grammar-fixtures: parser cases shared by both test suites
- fixtures/demo: synthetic prices plus public-domain government data

## Rules
- Work phase by phase (spec: Roadmap). Don't start a phase before the previous gate passes.
- Each function lives in apps/web/src/functions/<CODE>/ with manifest.ts and View.tsx,
  and meets the definition of done in the spec's Function framework section.
- Views never call providers; they declare fields in the manifest.
- Every value carries provenance. Missing data renders as a dash with a reason. Never invent or
  hard-code market data.
- Field names use the dotted scheme: px., ref., fin., val., econ., bulk. Store timestamps in UTC.
- Frontend types are generated from the server's OpenAPI schema, never handwritten.
- Develop in demo mode; live keys are for the nightly suite only.
- Ask before: licenses outside the allowlist, paid APIs, grammar or field or API changes,
  destructive migrations, brand or legal questions.
- Log judgment calls in docs/DECISIONS.md and update docs/PROGRESS.md every session.
- No scraping. Respect provider rate limits. SEC requests carry the configured User-Agent.
- Never commit secrets.
