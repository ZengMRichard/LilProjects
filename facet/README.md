# Facet

Guided selfies in, a measured and explained report on your facial proportions out. Facet is
deterministic geometry on top of learned landmarks: a face mesh finds the points, plain maths
computes every number, and each number is shown with its typical range and how sure the system is.

There is no attractiveness score and no ranking. The full product and technical spec is in
[docs/SPEC.md](docs/SPEC.md) (original: [PDF](docs/Facet-Product-and-Technical-Spec.pdf)).

> **Development build, not for release.** Reference ranges are provisional placeholders with no
> cited study behind them, the skin snapshot is uncalibrated image statistics, and profile angles
> are experimental. Nothing here is a diagnosis or medical advice. See
> [docs/PROGRESS.md](docs/PROGRESS.md) for exactly what is and is not built.

## Quick start

Requires [uv](https://docs.astral.sh/uv/) and Node 22 with pnpm.

```sh
cd facet
uv sync && pnpm install
pnpm dev                 # web on http://localhost:3000, API on http://127.0.0.1:8787
```

Open http://localhost:3000, sign in with any email (development applies the sign-in link
instantly), confirm your age and give biometric consent, then either:

- **Start camera capture**: three guided views (front, left, right). The face mesh runs in your
  browser; the photo is taken automatically when head angle, lighting, sharpness and expression
  all pass and you have blinked once.
- **Use the synthetic sample**: runs the same pipeline on a model face, with no camera or photo.

The free preview shows face shape, three headline proportions, the skin snapshot and a starter
routine. "Unlock the full report" is in test mode and takes no payment.

Local state (SQLite database, encrypted photos, keys) lives in `facet/.data/`, which is ignored
by git. Delete it to start over.

## What is in the report

| Section | Contents |
| --- | --- |
| Opener | What the numbers can and cannot tell you; that most asymmetry is normal |
| Shape and proportions | Face shape, thirds and fifths, drawn on your own landmarks |
| Metric cards | 16 measurements across face, eyes, nose, lips, jaw. Each: what was measured, your value, typical range, plain meaning, 95% interval, confidence |
| Symmetry map | Overall index, per-region differences and a heatmap |
| Skin snapshot | Texture, redness, spots, pores, under-eye darkness as low / medium / high (experimental) |
| Summary | Which proportions are typical and which are distinctive, in neutral language |
| Routine plan | Non-invasive habits ranked by evidence level; procedures only as questions for a professional |
| Not measured | Metrics that cannot be measured honestly yet, with the reason |

Progress compares scans and marks each change as real or within measurement noise. Settings holds
the three separate consents, photo deletion, a full data export, the access log and account
deletion.

## Layout

```
apps/web/                  Next.js: marketing, capture, report viewer, print layout for the PDF
services/api/              FastAPI: auth, consent, scans, reports, billing (test), export, deletion
services/worker/           Pipeline: quality gate, metrics, skin, narrative guardrails, PDF
packages/metrics/          Pure-Python metric functions, versioned, unit-tested
packages/norms/            Reference ranges (provisional) and how a value is placed against them
packages/report-templates/ Metric copy, narrative templates, routine plan, banned-phrase list
packages/fixtures/         Pose cases shared by the Python and TypeScript test suites
tests/                     Python tests, including the golden report snapshot
docs/                      SPEC.md, DECISIONS.md, PROGRESS.md
```

## Development

| Task | Command |
| --- | --- |
| Run everything | `pnpm dev` (or `pnpm build && pnpm dev --start` for the built app) |
| Python tests | `uv run pytest` |
| Web unit tests | `pnpm -C apps/web test` |
| End-to-end | `pnpm build && pnpm -C apps/web e2e` (set `PW_CHROMIUM` to use an installed Chromium) |
| Lint and types | `pnpm check` |
| Regenerate API types | `pnpm -C apps/web gen:api` |
| Regenerate fixtures | `uv run python scripts/build_fixtures.py` and `scripts/build_sample_report.py` |
| Update the golden report | `UPDATE_GOLDEN=1 uv run pytest tests/test_golden.py` |
| Run the purge job once | `uv run facet purge` |

Configuration is by environment variable; see [.env.example](.env.example). The optional LLM
rewrite of the report summary needs `uv sync --extra llm`, `FACET_LLM_NARRATIVE=1` and Anthropic
API credentials. PDF export needs Chrome or Chromium (`FACET_CHROME_PATH`); without it the app
falls back to the browser's print dialog.

## Privacy by design

- Written, unbundled, revocable consent before the camera turns on; 18+ gate that stores only
  the outcome.
- Photos are stripped of metadata, encrypted at rest, deleted 30 days after the report (24 hours
  if the scan is abandoned, immediately if rejected or on request), and never used to identify
  anyone.
- Every photo read and every deletion is written to an audit log the user can read.
- Export everything, or delete the account and everything derived from it, from Settings.

MediaPipe's canonical face model is vendored under Apache-2.0; see [NOTICE](NOTICE).
