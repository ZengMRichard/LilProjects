# Decisions

Numbered records of judgment calls: context, decision, alternatives considered. Items marked
**Needs owner** are open questions for the human owner.

## D-001 · The project lives in `almanac/` inside LilProjects
- Context: the spec assumes an empty repository named for the product; this repository
  (LilProjects) holds several small projects.
- Decision: everything lives under `almanac/`; CI sits at the repository root in
  `.github/workflows/almanac.yml`, scoped to `almanac/**`.
- Alternatives: a dedicated repository (cleaner, but not available in this session).

## D-002 · `docs/SPEC.md` carries Part II only
- Context: Part I of the source document describes another vendor's product by name and lists its
  function codes. The brand rules say no vendor name in the repository beyond one factual README
  line, and no preset reproducing another vendor's code set.
- Decision: SPEC.md holds the build spec (Part II) and the appendices that do not name the vendor.
  Part I and the crosswalk table stay in the owner's copy of the source document.

## D-003 · `almanac start` defaults to demo mode in Phase 0
- Context: Phase 0 ships no live providers, so live mode would show a dash for every value.
- Decision: the default `data.mode` is `"demo"` until Phase 1 adds providers; `config.toml` or
  `ALMANAC_MODE=live` override it. In live mode with no providers, every value is honestly
  unavailable ("No provider configured for px.last on EQUITY").

## D-004 · Internal input fields for computed values
- Context: `px.chg`, `val.pe_ttm` and `val.div_yield` are computed, but the Phase 1 field table
  names no previous-close, TTM EPS or TTM dividend field to compute them from.
- Decision: the router uses three internal fields, `px.prev_close`, `fin.eps_ttm` and
  `fin.dps_ttm`. They are not in the public registry (`/v1/fields` does not list them), so the
  public field names are unchanged. **Needs owner** if they should become public fields.

## D-005 · Four-panel CSS grid instead of dockview in Phase 0
- Context: the stack lists dockview for splits, tabs, floating groups and serializable layouts.
  Phase 0 needs a fixed 2 × 2 dock with focus, and the layout serializes as four commands.
- Decision: a CSS grid. dockview arrives with WKSP (Phase 2), when resizable and tabbed layouts
  are in scope. This keeps the initial bundle small (93 KB gzipped against a 500 KB budget).

## D-006 · Framework additions to `FunctionProps` and `ParamSpec`
- Decision: `FunctionProps` gains `registerExport`, `run`, `setParam` and `compact` (for tiles),
  because views must hand the framework their export table or canvas and change their own
  parameters without importing the shell. `ParamSpec` gains `rest` (the last positional takes
  the remaining words, for `HELP balance sheet`). `FunctionManifest` gains `examples`, which
  HELP runs and the grammar suite validates. The spec's interfaces are otherwise unchanged.

## D-007 · Chart studies are computed in the browser
- Context: the spec puts studies in server analytics.
- Decision: SMA, EMA and Bollinger bands run client-side over the bars already fetched, so a study
  toggle needs no request. They are pure functions with unit tests (`apps/web/src/ui/studies.ts`).
  Server analytics keeps returns, resampling and valuation.

## D-008 · License allowlist exceptions (**Needs owner**)
- Context: the allowlist is MIT, BSD, ISC, Apache-2.0, MPL-2.0 and public domain (OFL for fonts).
  Four dependencies are permissive but outside it:
  - `numpy` (BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0): direct; powers the demo
    price generator. Without it, generation is about 20× slower.
  - `typing_extensions` (PSF-2.0): transitive via FastAPI and Pydantic.
  - `argparse` (Python-2.0) and `@csstools/css-syntax-patches-for-csstree` (MIT-0): dev-only npm
    transitives; not shipped in the bundle.
- Decision: listed in `scripts/license-exceptions.json` as "pending human approval"; the license
  checks print them as warnings instead of failing. The owner should approve them, or say which
  to replace.

## D-009 · `websockets` and `tzdata` as server dependencies
- Context: Uvicorn needs a WebSocket implementation for `/v1/stream`; Windows has no system time
  zone database for `zoneinfo`.
- Decision: `websockets` (BSD-3-Clause) always; `tzdata` (Apache-2.0) on Windows only.

## D-010 · Demo dataset design
- Prices are a seeded random walk in 5-minute (or 15-minute) steps; daily bars aggregate those
  steps, so intraday and daily views agree exactly. Each path is anchored so the close on
  2026-01-02 equals a plausible level, and yields mean-revert so they stay positive.
- Identity facts (names, tickers, SEC CIKs, SIC codes) are public. Share counts, EPS, dividends
  and the filing calendar are synthetic, tagged `provider="demo"`, and links point to the real
  EDGAR company page.
- Exchange holidays are not modeled; sessions run every weekday (crypto every day).

## D-011 · Search screens suggest function codes
- Context: grammar rule 4 makes an unknown single word a search (`CHRTT` is a search), while the
  spec says an unknown code lists the nearest codes plus a HELP search.
- Decision: search screens show symbol matches plus the nearest function codes and a
  `HELP <text>` link, all numbered, so a typo never dead-ends. The grammar is unchanged.

## D-012 · The session token is kept in localStorage
- Context: `almanac start` passes the token in the URL fragment. sessionStorage would lose it on a
  new tab opened from a copied link (toolbar 96).
- Decision: the web app stores it in localStorage for its origin (127.0.0.1:port) and strips it
  from the URL. A restarted server issues a new token; the page then explains how to get a fresh
  link. `ALMANAC_TOKEN` pins the token for development and tests.
