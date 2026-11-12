# Facet

Measured, explained facial-proportion reports: a Next.js web app, a FastAPI service with an
in-process worker, and a pure-Python metrics library.
Spec: docs/SPEC.md. Build log: docs/PROGRESS.md. Decisions: docs/DECISIONS.md.

## Commands
- Install: `uv sync` and `pnpm install`
- Run: `pnpm dev` (web :3000, API :8787). Built app: `pnpm build && pnpm dev --start`
- Python tests: `uv run pytest`
- Web tests: `pnpm -C apps/web test`
- End-to-end: `pnpm build && pnpm -C apps/web e2e` (set `PW_CHROMIUM` for a preinstalled Chromium)
- Lint and types: `pnpm check`
- Regenerate API types after changing schemas.py: `pnpm -C apps/web gen:api`
- Regenerate after changing metrics, norms or copy: `UPDATE_GOLDEN=1 uv run pytest tests/test_golden.py`,
  `uv run python scripts/build_sample_report.py`, `uv run python scripts/build_fixtures.py`

## Layout
- packages/metrics/facet_metrics: geometry.py (pose, frontalise), registry.py (one function per metric),
  symmetry.py, shape.py, engine.py (uncertainty)
- packages/norms/facet_norms, packages/report-templates/facet_templates
- services/worker/facet_worker: protocol.py, quality.py, skin.py, pipeline.py, narrative_llm.py, pdf.py
- services/api/facet_api: db.py, schemas.py, report_view.py, routes/{auth,scans,reports}.py
- apps/web/src: app/ (pages), components/{report,capture}, lib/{api,face}

## Rules
- Describe, never grade. Report text must pass facet_templates/banned.py; tests enforce it. No
  overall score, no ranking, no "ideal".
- Never invent a number. A metric that cannot be measured honestly is listed as not measured
  with the reason. Never cite a study that has not been licensed; norms stay `provisional` until
  one is.
- Every metric is a pure function of landmarks with a unit test on a fixture of known geometry.
  A metric change bumps METRICS_LIB_VERSION and regenerates the golden report.
- Pose maths exists in Python and TypeScript and must agree: packages/fixtures/pose_cases.json.
- Capture thresholds live only in facet_worker/protocol.py; the web app reads them from the API.
- Plan items: lifestyle and skincare, then grooming and style, then professional topics. Each has
  an evidence level. Procedures appear only as questions to ask. Ingredient-level only, no brands.
- Images: never stored unencrypted, never logged, every read and deletion audited, nothing
  outlives purge_at. Never store the date of birth or the goals note.
- Web types come from the API's OpenAPI schema, never handwritten.
- Status colours (good/warn/bad) are for capture checks and destructive actions only. Results use
  the single powder-blue hue.
- Log judgment calls in docs/DECISIONS.md and update docs/PROGRESS.md.
- Ask before: citing or adding reference norms, changing consent text or retention, adding a
  payment or auth provider, anything that claims accuracy.
