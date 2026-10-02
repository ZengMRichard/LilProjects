# Progress

Running build log, one entry per session.

## 2026-10-02 · Phase 0: skeleton on demo data

**Goal.** Build Phase 0 of the spec and pass Gate 0: a keyboard-only Playwright journey opens all
six functions, exports a CSV, and restores the workspace after a restart.

**Plan.**
1. Monorepo: `pyproject.toml` (uv), pnpm workspace with `apps/web`, Biome, Ruff, Pyright.
2. Grammar first: shared fixtures in `packages/grammar-fixtures`, then the Python and TypeScript
   parsers against them.
3. Server: models, field registry, symbol master (SQLite FTS5), resolver, demo provider, router,
   FastAPI app with token, Host and Origin checks, WebSocket stream hub, state store, CLI.
4. Shell: command bar with local autocomplete, four-panel dock, keymap, themes, status bar, tiles,
   workspace persistence and URL fragment links.
5. Functions: HELP, RECENT, DESC, CHRT, HIST, WMON; exports CSV, PNG and link.
6. Gate 0 end-to-end test, axe-core check, CI, license and secret scanning, docs.

**Done.**
- Server (77 tests): grammar on the shared fixtures; resolver including `US GOVT` → curve and
  unsourced sectors; demo provider whose intraday steps aggregate exactly to daily bars; router
  with computed fields (`px.chg`, 52-week range, market cap, P/E, dividend yield) and typed
  `Unavailable` reasons; currency conversion through FX pairs; filings table; state, history and
  `aliases.toml`; token, Host, Origin and WebSocket auth; weekly and monthly resampling checked
  against pandas, with property tests.
- Web (93 unit tests): parser on the same fixtures; argument binding with suggestions; local
  autocomplete; formatting, studies, CSV/TSV; CHRT bar transform; missing-data dash and tooltip;
  data-state blocks; manifest examples validated by the grammar suite; generated function docs
  kept current by a test.
- Gate 0 passes (`apps/web/e2e/gate0.spec.ts`): the keyboard-only journey through all six
  functions, PNG and CSV exports (CSV with provenance lines), F1 help, hot links, error
  suggestions, back navigation, and workspace restore after a server restart; plus URL-fragment restore and an
  axe-core run with no serious or critical violations.
- Initial JavaScript is 93 KB gzipped (budget 500 KB); the chart library loads only with CHRT.

**Phase 0 checklist**
- [x] Monorepo, CI, license and secret scanning, `CLAUDE.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`
- [x] Server: FastAPI app, session token, Host and Origin checks, OpenAPI docs, demo provider, symbol master
- [x] Shell: command bar, grammar with shared fixtures, autocomplete, four-panel dock, keymap, themes, status bar
- [x] Functions: HELP, RECENT, DESC, CHRT, HIST, WMON
- [x] Exports: CSV, PNG, link
- [x] Gate 0

**Function acceptance boxes**, verified where marked
- HELP: [x] every function appears and F1 opens its page; [x] "yield" finds CURV, "10-K" finds FIN
  and FILE; [x] examples run and the grammar suite validates each.
- RECENT: [x] history survives a restart.
- DESC: [x] every statistic filled in demo mode; [x] a dash with the missing capability when no
  provider answers; [x] market cap = last × shares in a unit test; [x] links open in the same panel.
- CHRT: [ ] range change from cache within 300 ms (not measured); [x] candles match fixture bars in
  a transform test; [x] `vs=` rebases to 0% (unit-tested `rebase`); [x] PNG export by keyboard
  (Ctrl+E; the footer with title, security, range, source and time is drawn but not asserted) and
  CSV of the visible data (Ctrl+Shift+E); [x] TradingView attribution logo kept on, credited on
  `HELP about` and in NOTICE.
- HIST: [ ] 5,000-row scrolling at 60 fps (virtualized, not measured); [x] weekly and monthly
  aggregation matches pandas; [ ] CSV and XLSX hold identical values (XLSX is Phase 1).
- WMON: [ ] 200 rows at five updates per second hold 50 fps (not measured); [x] lists survive a
  restart (server state); [ ] polling budget in a fake-clock test (no polled provider exists until
  Phase 1).

**Known gaps**
- License exceptions await the owner (D-008): numpy, typing_extensions, and two dev-only npm packages.
- Not yet built from the Phase 0 stack: `~/.almanac/keymap.toml` overrides (the keymap is fixed),
  tile link groups, `GET /v1/functions` (manifests live in the web app), visual screenshot tests in
  three themes, Firefox in CI, DuckDB cache and `exchange_calendars` (both arrive with live
  providers; exchange holidays are not modeled), dockview (D-005).
- Performance budgets above are not yet benchmarked in CI.
- The demo has no ECON, CURV or FXM data yet; those functions are Phase 1.

**Next.** Phase 1: SEC EDGAR, FRED, Treasury, ECB and Alpha Vantage adapters with recorded tests;
rate limits and cache rules in the router; FIN, FILE, ECON, ECAL, CURV, FXM, FIELD; XLSX export;
`almanac doctor` and `almanac keys`.

**Open questions for the owner.**
1. Approve the four license exceptions (D-008), or name replacements.
2. Should `px.prev_close`, `fin.eps_ttm` and `fin.dps_ttm` become public fields (D-004)?
3. Final product name after a trademark search.

**Summary.** Almanac now runs locally in demo mode: `uv run almanac demo` serves a four-panel,
keyboard-driven terminal with a shared command grammar, six working functions on a deterministic
synthetic dataset, live-ticking quotes over one WebSocket, provenance on every number, CSV/PNG/link
exports, and workspaces that survive restarts. Gate 0 passes; Phase 1 can start once the owner
settles the license exceptions.
