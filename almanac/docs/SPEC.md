# Almanac build spec

This is Part II of the source document "Teardown + Open-Source Build Spec" (Sep 30, 2026),
transcribed for Claude Code. Part I, which describes the commercial terminal Almanac takes its
interaction style from, is kept out of this repository under the brand rules (see
docs/DECISIONS.md D-002).

## Product definition

Almanac is an open-source, keyboard-first financial terminal that runs on the user's own machine,
speaks a command grammar (security, sector word, function code, arguments, Enter), and pulls data
from providers the user configures. It ships with a demo dataset, so every Phase 1 function works
offline on first run.

**Who it is for:** students and self-directed investors learning markets with public data;
analysts who want fast, dense, scriptable views over data they already license; developers who
want a terminal they can extend with their own functions and sources.

**Principles** (each one is testable)

1. **Keyboard first.** Every action works without a mouse, and one command line reaches any screen.
2. **Density with clarity.** Many numbers per screen, aligned in columns, color used only for meaning.
3. **Honest data.** Every value can show its provider, timestamp and delay. Missing data shows as
   missing, never silently estimated or swapped.
4. **Provider-agnostic.** Functions request fields, not vendors; no data source is hard-wired.
5. **Local-first and private.** Watchlists, portfolios, notes and API keys stay on the user's machine.
6. **Offline on first run.** A bundled, clearly labeled demo dataset powers every Phase 1 function.
7. **Extensible.** Functions and providers are plug-ins with a documented manifest.
8. **Fast.** A command shows its screen skeleton within 100 ms.

**Non-goals:** replacing licensed real-time institutional data, OTC pricing or professional
newswires; trade execution (read-only through Phase 3); a messaging network; scraping or
unofficial endpoints in the core; a hosted public service that redistributes provider data; any
other vendor's name, logo, keyboard design, screenshot or data.

**Definition of v1.0:** a new user installs with one command, explores in demo mode, adds free API
keys, and uses fifteen functions on live public data, with every Phase 1 and 2 acceptance test
passing.

## Legal, licensing and data-use rules

Almanac borrows an interaction style, not a brand: its own name, look, codes and data sources,
under Apache-2.0. This is a build rule set, not legal advice.

**Code license**
- Apache-2.0.
- Dependencies must be MIT, BSD, ISC, Apache-2.0 or MPL-2.0; fonts must be SIL OFL. CI fails on
  anything else, checked by a license scanner against this allowlist.
- No GPL or AGPL code without a human's written approval. AGPL projects may only be reached over
  HTTP as a separately installed service.
- A NOTICE file lists third-party attributions. TradingView Lightweight Charts requires crediting
  TradingView with a link on a user-visible page; keep its attribution logo on, or credit it on
  the About screen.

**Brand and look**
- No other vendor's name in the product name, repository, package names, logo or interface text.
  The README may say once, factually, that Almanac is inspired by professional market terminals.
- No vendor logos, screenshots, keyboard artwork or colored-key imitations.
- The default theme must not be amber on black. A retro amber theme may ship as an option only
  after the human owner approves it.
- Function codes are Almanac's own. Users may map any code in a local alias file; the project does
  not ship a preset that reproduces another vendor's code set.

**Data use**
1. Official APIs only. No scraping, no unofficial endpoints in the core.
2. Each provider adapter stores its terms URL, rate limits and required attribution, and the
   interface shows that attribution wherever the data appears.
3. API keys belong to the user. The project never ships or proxies shared keys.
4. No redistribution. Almanac runs locally per user; export dialogs remind users that provider
   terms govern what they share.
5. News is stored as headline, time, source, link and any provider-supplied summary, never
   scraped full text.
6. SEC requests carry a User-Agent naming the app and the user's contact email, and stay under 10
   requests per second.

**User-facing notices:** first run and About screen say data may be delayed or wrong and nothing
is investment advice. No telemetry by default.

**Decisions reserved for the human owner:** the final product name (after a trademark search), the
optional amber theme, and any non-permissive dependency.

## Architecture, stack and repository layout

A local web app: a Python server on 127.0.0.1 owns data access, caching and alerts; a TypeScript
single-page app owns the command line, panels and rendering. A desktop wrapper arrives in Phase 3.
The browser and other local clients talk only to the local server. Only the provider router and
the stream hub reach outside the machine, which keeps keys, rate limits and provenance in one place.

| Component | Responsibility | Talks to |
| --- | --- | --- |
| Shell (web) | Command line, parser, autocomplete, panel dock, keymap, themes, status bar | Function views, API client |
| Function views (web) | One module per function code: a manifest plus a React view | API and stream clients, UI kit |
| UI kit (web) | Dense grid, charts, fields, tabs, hot links, number formatting, tick flashes | Function views |
| API and stream clients (web) | Typed REST calls with caching; one WebSocket for all live data | API server |
| API server | REST and WebSocket endpoints, session token, OpenAPI docs | Core services |
| Resolver | Turns typed input into canonical instruments; searches the symbol master | Symbol store, providers |
| Field registry | Field names, types, units and shapes; maps each field to providers | Provider router |
| Provider router | Picks a provider per request by capability and user priority; rate limits, fallback, provenance | Providers, cache |
| Providers | One adapter per data source | External APIs |
| Stores | DuckDB for time series and fundamentals; SQLite for settings, watchlists, layouts, alerts, quotas | Router, jobs |
| Jobs | Scheduled refreshes, alert evaluation, filing and release polling | Router, stores, stream hub |
| Stream hub | Merges provider streams and polled quotes into client subscriptions, with throttling | Providers, API server |
| Analytics | Pure functions: returns, studies, curve interpolation, bond math, option pricing | Server, exports |

**Stack:** TypeScript, React, Vite; dockview (docking); TanStack Table + Virtual (grids);
TradingView Lightweight Charts (price charts); Apache ECharts (other charts); Zustand and TanStack
Query (client state); Python 3.12+, FastAPI, Pydantic v2, httpx, Uvicorn (backend); DuckDB and
SQLite (storage); exchange_calendars; XlsxWriter; keyring; uv, pnpm, Ruff, Pyright, Biome
(tooling); pytest, vcrpy, Vitest, Testing Library, Playwright, axe-core (tests); Tauri (desktop,
Phase 3). Browsers reserve some function keys, so in the browser the sector keys are typed words
and short aliases; the Tauri build adds true F-key bindings.

```
almanac/
├── README.md, LICENSE (Apache-2.0), NOTICE, CLAUDE.md
├── docs/            SPEC.md, PROGRESS.md, DECISIONS.md, functions/ (generated)
├── apps/web/src/    shell/ grammar/ functions/<CODE>/ ui/ data/
├── server/almanac/  api/ core/ providers/ analytics/ store/ jobs/ cli.py
├── server/tests/
├── packages/        grammar-fixtures/ (shared parser cases), almanac-py/ (SDK)
├── fixtures/demo/   bundled demo dataset
└── .github/workflows/
```

| Command | Does |
| --- | --- |
| `almanac start` | Starts the server on 127.0.0.1:8765 and opens the browser with a session token |
| `almanac demo` | Same, restricted to the demo provider |
| `almanac keys set <provider>` | Stores an API key in the OS keychain |
| `almanac doctor` | Checks keys, connectivity, rate-limit headroom and cache health |

## Domain model and schemas

Instrument × field × time, with provenance attached to every value. The server defines the models
in Pydantic; the web app's TypeScript types are generated from the OpenAPI schema.

**Instrument IDs** take the form `{CLASS}:{NAMESPACE}:{CODE}`, stable across providers.

| Class | Example ID | Displayed as | Notes |
| --- | --- | --- | --- |
| EQUITY | `EQUITY:US:AAPL` | `AAPL US EQUITY` | Namespace is a country composite or an ISO 10383 exchange code |
| INDEX | `INDEX:US:SPX` | `SPX INDEX` | Where index levels are unavailable, an ETF proxy is shown and labeled |
| CURNCY | `CURNCY:FX:EURUSD` | `EURUSD CURNCY` | Base then quote currency |
| CRYPTO | `CRYPTO:SPOT:BTCUSD` | `BTCUSD CRYPTO` | Spot pairs from public exchange feeds |
| GOVT | `GOVT:US:UST10Y` | `UST10Y GOVT` | Constant-maturity yields; individual bonds in Phase 3 |
| CMDTY | `CMDTY:EIA:WTI` | `WTI CMDTY` | Friendly codes map to source series |
| ECON | `ECON:FRED:UNRATE` | `UNRATE ECON` | Namespace names the source |
| CURVE | `CURVE:US:UST_PAR` | `US CURV` | A whole curve as one object |

**Field names** are dotted by family: `px.` prices, `ref.` reference, `fin.` reported financials,
`val.` valuation, `econ.` economic observations, `bulk.` tables. Phase 1 needs:

| Field | Unit | Shapes | Meaning | Phase 1 source |
| --- | --- | --- | --- | --- |
| `px.last` | price | reference, stream | Last trade or latest close | Price provider or demo |
| `px.open`, `px.high`, `px.low`, `px.close` | price | history | Bar values | Price provider or demo |
| `px.volume` | shares | history, stream | Traded volume | Price provider or demo |
| `px.bid`, `px.ask` | price | stream | Best bid and ask | Streaming provider |
| `px.chg`, `px.chg_pct` | price, % | reference, stream | Change from previous close | Computed |
| `px.hi_52w`, `px.lo_52w` | price | reference | 52-week range | Computed from history |
| `ref.name`, `ref.currency`, `ref.country`, `ref.mic` | text | reference | Identity | Symbol master |
| `ref.sic`, `ref.industry` | text | reference | SEC industry code and title | SEC |
| `ref.description` | text | reference | Business description | Provider that supplies one, else the 10-K |
| `ref.cik`, `ref.figi` | text | reference | Identifiers | SEC, OpenFIGI |
| `fin.shares_out` | shares | reference, history | Shares outstanding from the cover page | SEC XBRL |
| `fin.revenue`, `fin.net_income`, `fin.eps_diluted` | currency | history by fiscal period | Income statement lines | SEC XBRL |
| `fin.assets`, `fin.liabilities`, `fin.equity` | currency | history by fiscal period | Balance sheet lines | SEC XBRL |
| `fin.cfo`, `fin.capex` | currency | history by fiscal period | Cash flow lines | SEC XBRL |
| `val.mkt_cap` | currency | reference | `px.last` × `fin.shares_out` | Computed |
| `val.pe_ttm` | ratio | reference | Price over trailing twelve-month diluted EPS | Computed |
| `val.div_yield` | % | reference | Trailing twelve-month dividends over price | Computed |
| `econ.value` | series unit | history | One observation of an economic series | FRED, EIA |
| `bulk.filings` | table | bulk | Form, filed date, period, accession number, link | SEC |
| `bulk.statements` | table | bulk | Standardized statements with as-reported concepts | SEC XBRL |
| `bulk.news` | table | bulk | Headlines for an instrument or topic | News providers |
| `bulk.curve` | table | bulk | Tenor, years, yield | U.S. Treasury |

**Core models** (see `server/almanac/core/models.py`): `AssetClass`, `Provenance` (provider,
fetched_at, as_of, delay_minutes, adjusted, attribution), `Instrument`, `Value`, `Point`,
`Series` (freq in 1m, 5m, 15m, 1h, 1d, 1w, 1mo, 1q, 1y), `Bar`, `Quote`, `StatementLine`,
`NewsItem`, `Release`, `CurvePoint`, `OptionQuote` (Phase 3).

**Rules:** timestamps are stored in UTC and displayed in the user's time zone. Money carries a
currency code. Percentages are stored as percent values, not fractions, and the unit says so. A
missing value is `None` with provenance, never zero.

## Data provider layer

Functions ask for fields; a router decides which provider answers, from what the user has
configured, and stamps provenance on the result. Adding a data source means writing one adapter.

**Provider interface** (`server/almanac/providers/base.py`): name, title, terms_url, attribution,
requires_key, capabilities, limits, field_map; async `search`, `reference`, `history`, `bulk`,
`stream`, `health`. Capabilities are strings `{shape}:{asset_class}[:{detail}]`, such as
`reference:EQUITY`, `history:EQUITY:1d`, `stream:CRYPTO`, `bulk:EQUITY:filings`, `calendar:ECON`.
Unsupported methods raise `NotSupported`.

**How the router answers a request**
1. Look up the field in the registry to find the capability it needs.
2. List providers with that capability, a key if one is required, and budget left, in the user's
   priority order.
3. Serve from cache if the cached value is fresh under the rules below.
4. Call the first candidate; on error or an empty result, try the next and record why.
5. Never mix providers inside one series, and never swap adjusted for unadjusted prices silently.
6. Stamp provenance on every value. If nothing can answer, return a typed `Unavailable` with
   reasons; the UI shows a dash and a tooltip such as "No provider configured for px.bid".

**Rate limits:** each provider gets a token bucket per interval plus a daily quota persisted in
SQLite, so restarts don't reset it. The status bar shows remaining budget for any provider under 20%.

| Data | Fresh until |
| --- | --- |
| Streaming quotes | Kept in memory only; the latest value per instrument |
| Intraday bars | 1 minute during market hours |
| Daily bars | One hour after the next session close |
| Reference data | 24 hours |
| Filings and XBRL facts | Never stale; the filing index is re-checked every 15 minutes in US business hours, within budget |
| Economic series | The series' next scheduled release |
| Treasury curve | Once per business day after publication |
| News | 2 minutes |

**Initial providers** (free-tier limits as published in September 2026; re-check before relying on them)

| Provider | Covers | Key | Free-tier limits | Phase |
| --- | --- | --- | --- | --- |
| Demo | Every Phase 1 function, offline | None | None | 0 |
| SEC EDGAR | Ticker-to-CIK map, filings, XBRL company facts and frames | None; a User-Agent with contact email | 10 requests per second | 1 |
| FRED | Economic series and release dates | Free key | Not verified | 1 |
| U.S. Treasury | Daily par yield curve | None | Not verified | 1 |
| European Central Bank | Daily euro reference exchange rates | None | Not verified | 1 |
| Alpha Vantage | Equity, FX and crypto prices; company overview; news sentiment | Free key | 25 requests per day | 1 |
| Twelve Data | Global stocks, FX, crypto; trial WebSocket credits | Free key | 8 per minute, 800 per day | 2 |
| Finnhub | US quotes, trade WebSocket, company news, earnings calendar | Free key | 60 calls per minute; WebSocket for 50 symbols | 2 |
| Tiingo | 30+ years of end-of-day prices, intraday, news | Free key | 500 symbols a month | 2 |
| EIA | Energy prices, inventories, production, electricity | Free key | Not verified | 2 |
| OpenFIGI | Identifier mapping | Optional key | Not verified | 2 |
| Coinbase and Kraken public feeds | Crypto trades and quotes over WebSocket | None | Per exchange terms | 2 |
| RSS feeds | Headlines from sources the user adds | None | Per source terms | 2 |
| Massive (formerly Polygon.io) | US stocks, options, indices, FX, crypto over REST and WebSocket | Paid tiers for most real-time data | Limited free tier | 3 |

**Symbol master:** a local SQLite table with full-text search, seeded from SEC's ticker-to-CIK file
for US equities plus curated lists of indices, FX majors, crypto majors, EIA commodity series and
popular FRED series. It powers autocomplete without network calls.

**Demo dataset rules:** prices are synthetic, generated by a seeded random walk, because commercial
price data cannot be redistributed. Government data that is public domain (SEC, Treasury, BLS, BEA)
may be bundled as-is. Every demo value is tagged `provider = "demo"`, and the UI shows a DEMO badge.

**Adapter checklist:** implement the interface; declare capabilities, limits, terms URL and
attribution; map fields; record HTTP fixtures for tests; write a docs page; add the provider to
`almanac doctor`.

## Command language

The grammar keeps the order: security tokens, a sector word, a function code, optional arguments,
then Enter. Parsing happens in the browser for instant feedback; the server re-validates and
resolves the security.

```
command    = hotlink | invocation | search ;
hotlink    = digit , { digit } ;                (* "3" activates link 3 on the focused screen *)
invocation = security , [ function ]            (* "AAPL US EQUITY", "AAPL US EQUITY CHRT 5Y" *)
           | function ;                         (* "CHRT 5Y" uses the panel's loaded security *)
security   = token , { token } , sector ;       (* at least one token before the sector *)
sector     = "EQUITY" | "INDEX" | "GOVT" | "CORP" | "CMDTY" | "CURNCY" | "CRYPTO" | "ECON"
           | "MUNI" | "PFD" | "MTGE" | "MMKT" | sector_alias ;   (* case-insensitive *)
function   = code , { argument } ;
code       = letter , { letter | digit } ;      (* 2 to 6 characters, registered or aliased *)
argument   = name , "=" , value | value ;
value      = token | quoted_string ;
search     = any input that matches none of the above ;
```

| Sector | Alias | Desktop key (Phase 3) | Data in Phase 1–2 |
| --- | --- | --- | --- |
| EQUITY | EQ | F8 | Yes |
| INDEX | IX | F10 | Yes, or labeled ETF proxies |
| GOVT | GV | F2 | Constant-maturity yields and curves |
| CORP | CP | F3 | Reference only, Phase 3 |
| CMDTY | CM | F9 | EIA spot series |
| CURNCY | FX | F11 | Yes |
| CRYPTO | CR | none | Yes |
| ECON | EC | none | Yes |
| MUNI, PFD, MTGE, MMKT | none | F4 to F7 | Recognized; the screen says no source is configured yet |

**Parsing rules**
1. Trim, collapse spaces, uppercase outside quotes.
2. Input of digits only is a hot link for the focused screen.
3. Look only at tokens before the first name=value argument, and find the last sector word that has
   at least one token before it. Tokens before it are the security; the next token is the function
   code; the rest are arguments.
4. With no sector word: a registered code or alias in first position is a function call on the
   loaded security (or a market-wide call); anything else is a search.
5. A security without a function opens its asset class's default function.
6. Positional arguments bind in the order the function's manifest declares; `name=value` binds by
   name. Unknown arguments are an error with suggestions.
7. When a ticker collides with a function code, the sector word decides; without one, the function
   wins and the security appears first in suggestions.

**Default function by asset class:** EQUITY → DESC; INDEX, CURNCY, CRYPTO, CMDTY → CHRT; a single
yield in GOVT → CHRT; a country in GOVT (`US GOVT`) → CURV; ECON → ECON.

| Argument | Values |
| --- | --- |
| period | 1D, 5D, 1M, 3M, 6M, YTD, 1Y, 5Y, 10Y, MAX |
| freq | 1m, 5m, 15m, 1h, 1d, 1w, 1mo, 1q, 1y |
| ccy | ISO currency code for conversion |
| start, end | ISO dates |
| vs | Comparison securities, comma-separated inside quotes |
| country | ISO country code |

**Resolution order for a security:** user alias, then exact display match in the symbol master,
then ticker plus namespace, then provider search. More than one match shows a numbered list; typing
a number picks one.

**Autocomplete:** runs locally on every keystroke, debounced 50 ms, from the symbol master, function
registry, aliases and history; never waits on the network; a final "search providers" row runs a
remote search on request. Ranking: exact ticker, exact function code, ticker prefix, name prefix,
fuzzy name, recent commands; recent use boosts a result. Up to 8 rows with a type badge, name and
exchange. Tab accepts, Enter runs, Esc closes the list and a second Esc clears the line. After a
sector word it suggests only codes valid for that asset class; after a code it suggests that
function's arguments and values.

**History and aliases:** Up and Down cycle the focused panel's history; `RECENT` lists the last 50
commands across panels. Personal shortcuts live in `~/.almanac/aliases.toml` with `[functions]`,
`[sectors]` and `[securities]` tables.

**Errors never dead-end.** An unknown code lists the nearest codes plus a HELP search. An unknown
security shows search results or says which provider would cover it. A function run on the wrong
asset class names the classes it supports and offers the corrected command.

| Input | Result |
| --- | --- |
| `AAPL US EQUITY` | Apple's DESC screen |
| `aapl us eq chrt 5y` | Five-year chart, case and alias folded |
| `CHRT vs="MSFT US EQ, SPY US EQ"` | Loaded security charted against two others |
| `FIN freq=1q` | Quarterly statements for the loaded security |
| `EURUSD FX CHRT 1Y` | One-year EUR/USD chart |
| `UNRATE EC` | US unemployment rate series |
| `US GV` | US Treasury curve |
| `WTI CM CHRT` | WTI spot price chart |
| `ECAL country=US` | US release calendar |
| `3` | Activates link 3 on the focused screen |
| `apple` | Search results with numbered picks |

Parser test cases live in `packages/grammar-fixtures/*.json` and run in both the TypeScript and
Python suites, so the two implementations cannot drift.

## UI shell and design system

The screen is a command bar, a dock of panels and a status bar; everything else is a function
rendered inside a panel. The default layout is four panels in a 2 × 2 grid plus a column of pinned
tiles. Exactly one panel has focus, marked by the accent border, and receives all keystrokes.

| Region | Contents | Behavior |
| --- | --- | --- |
| Command bar | Focused panel's number, loaded-security chip, input, autocomplete list | Always targets the focused panel |
| Panel header | Panel number, security, function code and title, toolbar actions numbered 90 to 99 | Toolbar: 90 refresh, 95 pin as tile, 96 copy link, 97 settings, 98 export, 99 help |
| Page tabs | For multi-page functions | Ctrl+Left and Ctrl+Right, or click |
| Panel body | The function's view; in-body links numbered 1 to 89 | Numbers typed in the command bar activate links |
| Tiles column | Always-on components: watchlist monitor, mini chart, headline ticker, world clocks | Tiles in the same link group follow one security |
| Status bar | Clocks for three zones, market open/closed badges, LIVE, DELAYED or DEMO mode, provider budget warnings, connection state, alert count | Click any badge for detail |

**Keymap** (user-editable in `~/.almanac/keymap.toml`)

| Action | Web | Desktop, Phase 3 |
| --- | --- | --- |
| Run the command | Enter | Enter |
| Close suggestions, then clear | Esc | Esc |
| Focus the command bar | `/` or Ctrl+K | same |
| Focus panel 1 to 4 | Alt+1 to Alt+4 | same |
| Back and forward within a panel | Ctrl+[ and Ctrl+] | same |
| Help for the current function | F1, or `?` outside a text field | F1 |
| Previous or next page of results | Page Up, Page Down | same |
| Command history | Up, Down in the command bar | same |
| Export | Ctrl+E | same |
| Copy grid selection as tab-separated text | Ctrl+C | same |
| Sector keys | Typed words or aliases | F2 to F12 per the sector table |

**Themes and tokens**

| Token | Almanac Dark | Almanac Light | Used for |
| --- | --- | --- | --- |
| `--bg` | #0E1116 | #FAFAF7 | App background |
| `--panel` | #141821 | #FFFFFF | Panel body |
| `--panel-head` | #1B2030 | #EEF0F4 | Panel headers, table headers |
| `--text` | #E6E8EE | #1A1D23 | Primary text |
| `--text-dim` | #8A93A6 | #5A6270 | Labels, secondary text, stale values |
| `--accent` | #4FB3FF | #0A66C2 | Focused-panel border, link numbers |
| `--input` | #2DD4BF | #0F766E | Editable parameter fields |
| `--up` | #3FB950 | #1A7F37 | Rising values |
| `--down` | #F85149 | #CF222E | Falling values |
| `--warn` | #D29922 | #9A6700 | Stale or delayed data, budget warnings |
| `--demo` | #A371F7 | #8250DF | DEMO badge |

A color-vision-deficiency mode swaps `--up` and `--down` for blue #58A6FF and orange #F0883E. In
every theme, arrows and signs also mark direction, so color never carries meaning alone. A
high-contrast theme ships in Phase 2.

**Type and density:** Inter for interface text and JetBrains Mono for numbers (SIL OFL). Base size
12 px. Compact rows 18 px, comfortable rows 22 px, switchable per workspace.

**Number formatting:** numbers right-aligned with tabular figures; decimals by field (prices to the
instrument's tick size, FX to 4 or 5 places, yields to 3, percentages to 2); large values
abbreviated K, M, B, T in overviews, full precision in tables and exports; minus signs by default,
parentheses as an option in financial statements; changes always signed (+1.23%); dates as
YYYY-MM-DD; times in 24-hour format in the user's zone, with the zone on hover; values past their
freshness rule are dimmed, with their age on hover.

**Tick flashes:** a changed value flashes its direction color at 25% opacity for 600 ms, at most
four visual updates per second per cell. With reduced motion requested, a ▲ or ▼ glyph shows for
two seconds instead.

**Focus and workspaces:** layouts, panel commands and tiles save as named workspaces in SQLite, and
the last one restores on start.

**Accessibility:** WCAG 2.2 AA contrast in every theme, full keyboard operation, ARIA grid roles,
polite live-region announcements for alerts, and a data-table view behind every chart.

## Function framework

A function is a folder holding a manifest and a view; the framework does the parsing, data
fetching, streaming, hot links and exports, so each view only draws. Adding a function never
touches the shell. Interfaces: `apps/web/src/functions/types.ts` (`FunctionKind`, `ParamSpec`,
`DataNeed`, `FunctionManifest`, `FunctionProps`).

**Lifecycle of one command**
1. The grammar parses the input and the server resolves the security.
2. The registry finds the manifest and validates asset class and arguments.
3. The view's skeleton renders within 100 ms from the manifest's pages and layout.
4. Every data need is fetched in parallel; each block fills in independently as its data arrives.
5. Stream fields subscribe through the shared WebSocket.
6. The view registers numbered hot links, such as `{ n: 1, label: "Chart", command: "CHRT" }`.
7. The panel's history and the URL fragment update, so the view can be bookmarked.
8. Leaving the function cancels pending requests and subscriptions.

**States every view handles:** loading, partial, empty, stale, error and demo. A failing data block
shows its provider, the reason and a retry link; it never blanks the panel.

**Registry:** manifests are discovered with `import.meta.glob("./*/manifest.ts", { eager: true })`
and views load lazily. A build step turns manifests plus hand-written notes into
`docs/functions/<CODE>.md`, which HELP searches.

**Plug-ins (Phase 3):** function packages named `almanac-fn-*` export a manifest and view; provider
packages register the Python entry point `almanac.providers`. Plug-ins run with full app
privileges, so Settings lists every installed plug-in and its source.

**Definition of done for a function**
- [ ] Manifest complete: parameters, data needs, exports, keywords, phase
- [ ] View handles loading, partial, empty, stale, error and demo states
- [ ] Works offline on demo data
- [ ] Unit tests for any calculation; grammar fixtures for its argument forms
- [ ] Playwright journey: open by keyboard, change a parameter, export
- [ ] Provenance on hover for every number
- [ ] Docs page generated and reviewed
- [ ] Accessibility check passes and keyboard-only use verified

## Function catalog

Thirty functions: six in Phase 0, seven more in Phase 1, twelve in Phase 2 and five in Phase 3.

| Code | Title | Kind | Phase | Primary data |
| --- | --- | --- | --- | --- |
| HELP | Help and function search | tool | 0 | Manifests, docs |
| RECENT | Command history | tool | 0 | Local |
| DESC | Security description | security | 0 | Symbol master, SEC, prices |
| CHRT | Price chart | security | 0 | Price history, SEC filing dates |
| HIST | Price history table | security | 0 | Price history |
| WMON | Watchlist monitor | market, tile | 0 | Quotes |
| FIN | Financial statements | security | 1 | SEC XBRL |
| FILE | Filings | security | 1 | SEC submissions |
| ECON | Economic series | security | 1 | FRED |
| ECAL | Release calendar | market | 1 | FRED release dates and series |
| CURV | Yield curves | market | 1 | U.S. Treasury |
| FXM | FX cross-rate matrix | market | 1 | ECB, price provider |
| FIELD | Field finder | tool | 1 | Field registry |
| NEWS | Headlines | security or market | 2 | News APIs, RSS, SEC 8-K |
| WIDX | World indices | market | 2 | Price provider |
| HEAT | Market heat map | market | 2 | Quotes, symbol master |
| MOVR | Top movers | market | 2 | Quotes |
| PEER | Peer comparison | security | 2 | SEC XBRL frames, prices |
| SCRN | Screener | market | 2 | SEC XBRL frames, prices |
| DIV | Dividends and splits | security | 2 | Price provider |
| RET | Total and relative return | security | 2 | Prices, dividends |
| NRGY | Energy dashboard | market | 2 | EIA |
| CMDY | Commodity prices | market | 2 | EIA, price provider |
| ALERT | Alerts manager | tool | 2 | Local rules |
| WKSP | Workspace manager | tool | 2 | Local |
| OPT | Option chain and Greeks | security | 3 | Options provider |
| BOND | Bond calculator | tool | 3 | User inputs, curves |
| RATE | Country rates monitor | market | 3 | FRED, Treasury |
| BOOK | Portfolio | tool | 3 | Local holdings, prices |
| ASK | AI research assistant | tool | 3 | The user's own LLM key plus Almanac's own API |

### Phase 0 functions

**HELP · Help and function search** · tool. Input: free text or a code (`HELP FIN`, `HELP yield`),
or F1 inside any function. Layout: search field, results list (code, title, one line), detail pane
with usage, arguments, examples and data sources.
- [ ] Every registered function appears, and F1 inside a function opens its page
- [ ] Searching "yield" finds CURV; searching "10-K" finds FIN and FILE
- [ ] Every example runs when selected, and the grammar suite validates each one

**RECENT · Command history** · tool. The last 50 commands across panels, with time and panel number.
Typing a row's number re-runs it in the focused panel.
- [ ] History survives a restart

**DESC · Security description** · security (EQUITY). Input: a security; `page=profile|stats|ids`.
Data: `ref.*`, `px.last`, `px.chg`, `px.chg_pct`, `px.hi_52w`, `px.lo_52w`, `val.mkt_cap`,
`val.pe_ttm`, `val.div_yield`, `fin.shares_out`, a one-year close series, the five latest filings.
Layout: a header strip (name, display ticker, exchange, currency, last, change, as-of time);
description on the left, clamped to six lines; a two-column key-statistics grid on the right; a
one-year sparkline and recent filings below. Links: 1 CHRT, 2 HIST, 3 FIN, 4 FILE, 5 NEWS, 6 PEER.
- [ ] `AAPL US EQUITY` opens DESC with every statistic filled in demo mode
- [ ] With no price provider, price cells show a dash and a tooltip naming the missing capability, and the rest renders
- [ ] Market cap equals last price × shares outstanding in a unit test
- [ ] Each link opens its function for the same security in the same panel

**CHRT · Price chart** · security (all priced classes). Input: period (positional, default 1Y);
`style=line|candle|bar`; `vs=` comparisons; `study=sma20,sma50,sma200,ema20,bb20`. Frequency
follows period: 1D uses 5-minute bars, 5D 15-minute, 1M to 1Y daily, 5Y and 10Y weekly, MAX
monthly. Layout: Lightweight Charts price pane over a volume pane; crosshair legend with open,
high, low, close; range links 1 to 8 (1D, 5D, 1M, 6M, YTD, 1Y, 5Y, MAX); SEC filing markers
(10-K, 10-Q, 8-K) on equities.
- [ ] A range change re-renders from cache within 300 ms
- [ ] Candles match fixture bars exactly in a transform test
- [ ] With `vs=`, every series rebases to 0% at the first visible point
- [ ] PNG export carries title, security, range, source and timestamp; CSV export holds the visible data
- [ ] TradingView attribution is satisfied

**HIST · Price history table** · security. Input: period or `start` and `end`; `freq=1d|1w|1mo`;
`ccy`. Layout: a summary strip (high and low with dates, average, change, percent change, average
volume) above a virtualized table of date, open, high, low, close, change, percent change and
volume, newest first. The header states whether prices are adjusted.
- [ ] A 5,000-row table scrolls at 60 frames per second
- [ ] Weekly and monthly aggregation matches a pandas reference in tests
- [ ] CSV and XLSX exports hold identical values

**WMON · Watchlist monitor** · market or tile. Input: `list=<name>`. Rows are added by typing a
security into the blank last row; columns are chosen from the field registry; rows reorder by drag
or Alt+Up and Alt+Down. Data: streamed or polled `px.last`, `px.chg`, `px.chg_pct`, `px.bid`,
`px.ask`, `px.volume` and update time. The header shows list name, mode (LIVE, DELAYED, POLLED or
DEMO) and update rate. A row's number opens DESC for that security.
- [ ] 200 rows ticking at five synthetic updates per second each hold at least 50 frames per second
- [ ] Lists survive a restart
- [ ] Polling never exceeds a provider's budget in a fake-clock test

### Phase 1 functions

**FIN · Financial statements** · security (EQUITY, US filers). Pages Income statement, Balance
sheet, Cash flow, Ratios; `freq=1y|1q`; `periods=5|10`. Data: SEC company facts mapped to standard
lines through `server/almanac/core/concepts.yaml`, which lists the XBRL concepts per line with
fallbacks. Fiscal fourth quarters are derived as the year minus the first three quarters for flow
items; TTM sums the last four quarters. Layout: oldest period on the left, newest then TTM on the
right; subtotals bold; hovering a value shows the as-reported concept, form and a link to the
filing. Ratios: gross, operating and net margin, return on equity, debt to equity, current ratio.
- [ ] Values match XBRL facts for five fixture companies
- [ ] Fourth-quarter derivation and TTM are unit-tested
- [ ] A missing line shows a dash and lists the concepts tried
- [ ] XLSX export keeps number formats and row indentation; the parentheses toggle works

**FILE · Filings** · security (EQUITY, US filers). Input: `form=10-K,10-Q,8-K,...`; period. Data:
SEC submissions. Layout: filed date, form, report period, a plain description (8-K item codes
translated, such as 2.02 Results of Operations), numbered rows. Selecting a row opens the filing's
SEC page in a new browser tab; Almanac does not copy filing text.
- [ ] In live mode a new filing appears within 15 minutes during US business hours, verified with a fake clock
- [ ] 8-K item codes translate to plain names
- [ ] Requests carry the configured User-Agent and stay under 10 per second, verified by a rate-limiter test

**ECON · Economic series** · security (ECON). Input: a series (`UNRATE EC`);
`transform=level|chg|pct|yoy`; period; `vs=` for a second series on a right axis. Without a series,
`ECON inflation` searches series. Data: FRED observations and series metadata; the US recession
indicator for shading. Layout: header (title, units, frequency, seasonal adjustment, source, last
update), chart with recession bands, observations table newest first.
- [ ] Transforms are unit-tested; year-over-year on monthly data is the 12-period percent change
- [ ] Recession bands match the indicator series
- [ ] Source attribution shows on screen and in exports

**ECAL · Release calendar** · market. Input: `country=US` (US only in Phase 1); `days=7`;
`importance=1|2|3`. Data: FRED release dates, mapped to key series per release; release times from a
maintained table for major releases, otherwise date only. Actual and prior fill from the series; a
consensus column appears only when a provider supplies one. Layout: rows grouped by day with time,
release, period, actual, prior, revision and importance dots. Released rows poll at 1, 5 and 15
minutes after the scheduled time.
- [ ] The next-7-days view is populated in demo mode
- [ ] Live actuals fill within 5 minutes of publication in a fake-clock test
- [ ] The consensus column is hidden when no provider supplies it

**CURV · Yield curves** · market (GOVT). Input: `US GOVT CURV` or `CURV`; `vs=1W,1M,1Y` or dates;
`curve=par|real`. Data: the Treasury's daily par yield curve, every published tenor from one month
to 30 years; the real yield curve for `curve=real`. Layout: curve chart with tenors evenly spaced
(toggle to true maturity in years); today's curve bold, comparisons dimmed; a lower pane of changes
in basis points by tenor; a table with the 2s10s, 3m10y and 5s30s spreads.
- [ ] Values match the Treasury fixture
- [ ] Spreads in basis points are unit-tested
- [ ] Comparison dates on weekends or holidays roll back to the prior business day

**FXM · FX cross-rate matrix** · market. Input: `ccys=USD,EUR,GBP,JPY,CHF,CAD,AUD,CNY` (default);
`mode=rate|chg`. Data: ECB daily euro reference rates, with crosses computed through the euro; live
quotes when a price provider covers FX. Layout: a matrix of row currency per column currency, blank
diagonal, change mode colored by percent move, header with source and as-of time.
- [ ] Crosses are consistent: A/B × B/C equals A/C within 1e-9
- [ ] Source and as-of time are always visible

**FIELD · Field finder** · tool. Searches the field registry by name or description. Each result
shows type, unit, shapes, the providers able to supply it (configured ones highlighted), and a
copyable Python SDK call.
- [ ] Every registry field is listed, and the copied SDK call runs against demo data

### Phase 2, one line each with its key test

| Code | Spec | Key acceptance test |
| --- | --- | --- |
| NEWS | Headlines for a security or the market from news APIs, user RSS feeds and 8-K filings; time, source, headline; a story pane with the provider summary and an outbound link | Near-duplicate stories collapse into one row; no article body is stored |
| WIDX | World indices grouped by region; real index levels where a provider has them, otherwise ETF proxies labeled as proxies | Every proxy row carries a visible PROXY label |
| HEAT | Treemap of a universe (watchlist, SIC sector or user CSV), sized by market cap, colored by percent change, drilling sector to industry to stock | 500 tiles render in under 500 ms |
| MOVR | Top gainers, losers and most active within a universe | Ranks match a fixture computation |
| PEER | Peers default to the same four-digit SIC code, top 10 by market cap; a metrics grid with rank and z-score per column; peers editable | Z-scores match a reference calculation |
| SCRN | Rule builder over cross-sectional fields (SEC frames for fundamentals, prices for the universe); results grid; saved screens | 5,000 companies on three rules return in under 2 seconds from cache |
| DIV | Dividend and split history plus trailing yield | Split-adjusted per-share amounts match the fixture |
| RET | Total return with dividends reinvested against a benchmark; annualized return, volatility, maximum drawdown | Each statistic matches a reference calculation |
| NRGY | EIA dashboard: WTI, Brent and Henry Hub spot; weekly crude and gas storage against their five-year range; monthly power generation mix | The five-year range by week of year is unit-tested |
| CMDY | Commodity spot table from EIA and any configured provider | Every row shows source and unit |
| ALERT | Rules for price levels, percent moves, new filings by form, releases and headline keywords; in-app and desktop notifications; cooldowns; a log | A price alert fires within 5 seconds of the triggering tick and not again inside its cooldown |
| WKSP | Save, load, rename, delete, export and import workspaces as JSON | An exported workspace re-imports identically |

## Output, export and API

Everything on screen can leave Almanac as a file, through the clipboard, as a link, or through a
local API and Python SDK. Provenance travels with every export.

| Format | Built in | Contents | Rules |
| --- | --- | --- | --- |
| CSV | Browser | Raw values, ISO dates, a header of field names with units | Optional leading `# source:` lines carry provenance |
| XLSX | Server, XlsxWriter | Formatted numbers, frozen header, a Sources sheet listing provenance per column | Same values as CSV, tested |
| PNG | Browser | Charts via Lightweight Charts' screenshot method; other panels via DOM capture | Footer with title, security, time and source |
| PDF | Browser print stylesheet in Phase 1; server-rendered workspace reports in Phase 2 | One panel, or a whole workspace | Same footer as PNG |
| TSV | Clipboard | Grid selection via Ctrl+C | Pastes cleanly into spreadsheets |
| Link | Clipboard, toolbar 96 | URL fragment with each panel's command, such as `#p1=AAPL%20US%20EQUITY%20CHRT%205Y` | Opens the same view on the same machine |

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/resolve?q=` | Resolve or search instruments |
| `POST /v1/ref` | Reference values: `{ids, fields, overrides}` |
| `POST /v1/hist` | History: `{id, fields, start, end, freq, adjusted, ccy}` |
| `POST /v1/bulk` | Tables: `{id, field, params}` |
| `GET /v1/fields?q=` | Field registry search |
| `GET /v1/functions` | Function manifests |
| `GET /v1/providers` | Configured providers, health and remaining budget |
| `POST /v1/export/xlsx` | Table in, workbook out |
| `GET, PUT /v1/state/{kind}` | Watchlists, workspaces, alerts, aliases |
| `WS /v1/stream` | Live subscriptions |

The server binds to 127.0.0.1 only. Every request needs the session token that `almanac start`
generates, sent as `X-Almanac-Token`; the server also checks the Host and Origin headers, which
blocks other web pages and DNS-rebinding attacks. OpenAPI docs are served at `/docs`.

**Python SDK (`almanac-py`):** `Almanac()` finds the local server and its token; `al.ref(ids,
fields)`, `al.hist(id, field, start=...)`, `al.bulk(id, field, **params)` return DataFrames with
provenance in `df.attrs["provenance"]`.

**Phase 3 channels:** an Excel add-in with `=ALMANAC.REF()`, `=ALMANAC.HIST()` and
`=ALMANAC.BULK()`; an MCP server with read-only tools for resolve, ref, hist, bulk, news search and
function listing (local only, token-protected).

## Streaming, alerts, storage and configuration

One WebSocket per browser tab carries every live value; the server merges real streams and
budget-aware polling behind it, so the interface treats both the same way and labels which is which.

```
// client to server
{"op": "sub", "req": 7, "ids": ["EQUITY:US:AAPL", "CRYPTO:SPOT:BTCUSD"], "fields": ["px.last", "px.bid", "px.ask"]}
{"op": "unsub", "req": 8, "ids": ["EQUITY:US:AAPL"]}
{"op": "ping", "t": 1790000000000}
// server to client
{"op": "ack", "req": 7, "mode": {"EQUITY:US:AAPL": "polled", "CRYPTO:SPOT:BTCUSD": "live"}}
{"op": "tick", "id": "CRYPTO:SPOT:BTCUSD", "ts": "2026-09-30T21:15:02.120Z", "v": {"px.last": 100.5}, "prov": "coinbase"}
{"op": "status", "id": "EQUITY:US:AAPL", "state": "delayed", "delay_minutes": 15}
{"op": "pong", "t": 1790000000000}
```

- The shell multiplexes every panel's subscriptions and reference-counts each instrument-field pair.
- The server sends at most four updates per second per instrument per client; the latest value wins.
- Heartbeat every 15 seconds. Reconnects back off from 0.5 seconds, doubling to a 30-second cap,
  and resubscribe.
- REST-only providers are polled within budget: the interval is the larger of the provider's
  minimum and what the per-minute budget allows for the subscribed symbols. The UI marks these POLLED.
- Outside trading sessions, per `exchange_calendars`, polling stops and the last close shows.

**Alerts engine:** rule kinds `price_cross` (each tick or poll), `pct_move` (each tick or poll),
`new_filing` (each EDGAR poll), `release` (when ECAL fills an actual), `headline` (each news fetch).
Each rule stores target, condition, window, cooldown, channels and an enabled flag. It fires at
most once per cooldown and records the triggering value with its provenance. Channels: an in-app
toast plus the alert log, and browser notifications once the user grants permission; native
notifications in the desktop build; webhooks in Phase 3.

**Storage** under `~/.almanac/` (override with `ALMANAC_HOME`): `config.toml` (settings and provider
priorities, no secrets), `aliases.toml`, `keymap.toml`, `almanac.db` (SQLite: watchlists,
workspaces, alerts, alert log, command history, quota ledger, symbol master with a full-text index),
`cache.duckdb` (bars, series, XBRL facts, curves, releases), `logs/` (rotating, secrets redacted).
Migrations are numbered SQL files applied at start-up, after an automatic backup of `almanac.db`.

**Configuration** in `~/.almanac/config.toml`: `[server] port, clocks`; `[data] mode ("live" or
"demo"), priority`; `[providers.<name>]` settings with keys referenced as `keyring:<name>`.
Environment variables `ALMANAC_HOME`, `ALMANAC_PORT`, `ALMANAC_MODE` and `ALMANAC_<PROVIDER>_KEY`
override the file for headless and CI use.

**Secrets and network rules:** API keys live in the OS keychain or environment variables, never in
plain config unless the user forces it past a warning. Keys are never logged, never sent to the
browser, and added to outbound requests only by the server. Each adapter declares its hosts; the
server refuses outbound calls anywhere else. `almanac doctor --net` prints the list.

## Testing, performance and accessibility

Every pull request must pass offline, on demo data and recorded provider responses; live-API tests
run nightly and never block a merge.

| Layer | Tools | Covers | Runs |
| --- | --- | --- | --- |
| Grammar | Vitest and pytest over shared JSON fixtures | Every command example in this spec and the docs | Every commit |
| Analytics | pytest with property-based tests | Returns, studies, curve math, TTM and fourth-quarter derivation, later bond and option math | Every commit |
| Providers | pytest with recorded HTTP responses | Request shape, parsing, field mapping, errors, rate limiting | Every commit, offline |
| Live providers | pytest, marked `live` | Real APIs with the maintainer's own keys | Nightly, optional |
| Components | Vitest and Testing Library | Loading, partial, empty, stale, error and demo states | Every commit |
| End-to-end | Playwright in demo mode | Keyboard journeys per function, export files, workspace restore | Every pull request |
| Visual | Playwright screenshots | Six key screens in three themes, with a diff threshold | Every pull request |
| Accessibility | axe-core inside Playwright | No serious or critical violations | Every pull request |
| Performance | Playwright traces and benchmarks | The budgets below | Nightly and before release |
| Licenses and secrets | License scanner, secret scanner | Dependency licenses, committed keys | Every commit |

CI runs server tests on Linux, macOS and Windows, and browser tests in Chromium and Firefox on pull
requests, adding WebKit nightly.

| Metric (mid-range laptop from 2022 or later) | Budget |
| --- | --- |
| Command to visible skeleton | 100 ms or less |
| Cached function fully rendered | 300 ms or less |
| Autocomplete update per keystroke | 16 ms or less |
| Grid scrolling, 5,000 rows | 60 frames per second |
| Monitor with 200 ticking rows | 50 fps or more, under 30% of one CPU core |
| Initial JavaScript download | 500 KB gzipped or less, functions loaded lazily |
| Memory, four panels plus a monitor | 500 MB or less |
| Server start to first request served | 2 seconds or less |

**Data correctness:** golden-file tests for each fixture company's statements, curve dates and FX
crosses; units and currencies asserted, not just numbers; adjusted and unadjusted prices kept as
separate series; property tests for invariants such as FX cross consistency and non-negative volume.

**Accessibility:** WCAG 2.2 AA contrast per theme, verified in the visual suite; a keyboard-only
Playwright journey for every function; grids expose row and column headers to screen readers;
charts offer a data-table view; reduced-motion settings replace tick flashes with glyphs.

## Roadmap

Four phases, each closed by a gate rather than a date: nothing in a later phase starts until the
earlier gate passes. Gate 2 is v1.0.

**Phase 0 · Skeleton on demo data**
- [ ] Monorepo, CI, license and secret scanning, `CLAUDE.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`
- [ ] Server: FastAPI app, session token, Host and Origin checks, OpenAPI docs, demo provider, symbol master
- [ ] Shell: command bar, grammar with shared fixtures, autocomplete, four-panel dock, keymap, themes, status bar
- [ ] Functions: HELP, RECENT, DESC, CHRT, HIST, WMON
- [ ] Exports: CSV, PNG, link

Gate 0: a keyboard-only Playwright journey opens all six functions, exports a CSV, and restores the
workspace after a restart.

**Phase 1 · Public-data MVP**
- [ ] Providers: SEC EDGAR, FRED, U.S. Treasury, ECB, Alpha Vantage, each with recorded tests
- [ ] Provider router, rate limits, cache rules, provenance tooltips
- [ ] Functions: FIN, FILE, ECON, ECAL, CURV, FXM, FIELD; DESC, CHRT and HIST on live data
- [ ] XLSX export; PDF through the print stylesheet
- [ ] `almanac doctor` and `almanac keys`

Gate 1: every Phase 0 and 1 acceptance box is ticked offline, and a live smoke run with free keys
finishes without exceeding any provider budget.

**Phase 2 · Real time and breadth**
- [ ] Stream hub with Finnhub, Twelve Data and crypto exchange feeds, plus polling for REST-only providers
- [ ] Providers: Tiingo, EIA, OpenFIGI, RSS
- [ ] Functions: NEWS, WIDX, HEAT, MOVR, PEER, SCRN, DIV, RET, NRGY, CMDY, ALERT, WKSP
- [ ] Python SDK, server-rendered workspace PDFs, high-contrast theme

Gate 2 (v1.0): the 200-row monitor meets its budget, alerts fire within 5 seconds in tests, and
release notes are written.

**Phase 3 · Power features**
- [ ] OPT: Black-Scholes pricing, implied-volatility solver and Greeks, once an options provider is configured
- [ ] BOND: price, yield, duration, convexity and spread to the curve
- [ ] RATE country monitor; BOOK local portfolio with performance and exposure
- [ ] ASK: an assistant that uses the user's own LLM API key, calls Almanac's API as tools and cites provenance
- [ ] MCP server, Excel add-in, plug-in API docs, Tauri desktop build with F-key sector bindings

Gate 3: a plug-in function built outside the repository loads and passes the definition-of-done checks.

## Working agreement for Claude Code

1. **Read order:** `CLAUDE.md`, then this spec.
2. **One phase at a time.** Work through the current phase's checklist; do not start the next
   phase until its gate passes.
3. **Plan before code.** At the start of each session, add a dated entry to `docs/PROGRESS.md`:
   goal, plan (files, order, tests), then done, next and open questions at the end.
4. **Tests first where practical:** grammar fixtures and analytics tests before their implementations.
5. **Small commits** with conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
6. **Done means green.** Never tick a box while tests, lint or type checks fail.
7. **Never invent data.** Numbers come from providers or the tagged demo set.
8. **Develop in demo mode.** Live keys are for the nightly suite and manual smoke runs only.
9. **Stop and ask the human before:** adding a dependency outside the license allowlist; calling a
   paid API; changing the grammar, field names or public API shapes; deleting user data or editing
   an applied migration; anything touching the brand and legal rules.
10. **Resolve ambiguity yourself otherwise.** Take the simplest reading that fits the principles,
    log it in `docs/DECISIONS.md` and keep going.
11. **Keep functions self-contained:** code in `functions/<CODE>/` imports only from `ui/`, `data/`
    and `grammar/`, never from another function.
12. **Respect providers:** no scraping, honor rate limits and terms, always send the SEC User-Agent.
13. **Protect secrets:** keys never enter the repository; `.env.example` holds placeholders.
14. **Watch the budgets:** re-run the performance checks for any change to grids, streams or charts.
15. **Leave the trail current:** update function docs, the README and the Known gaps list in
    `docs/PROGRESS.md`, and end each session with a one-paragraph summary.

## Glossary

| Term | Meaning |
| --- | --- |
| Basis point (bp) | One hundredth of a percentage point |
| CIK | The SEC's Central Index Key, a permanent ID for each filer |
| Composite listing | A security's quote consolidated across a country's exchanges |
| Delayed data | Prices published after a lag, commonly 15 minutes |
| EDGAR | The SEC's electronic filing system |
| FIGI | Financial Instrument Global Identifier, an open 12-character ID |
| Frames (XBRL) | An SEC API returning one reported concept for every company in a period |
| Greeks | An option's sensitivities: delta, gamma, vega, theta, rho |
| Implied volatility | The volatility that makes a pricing model match an option's market price |
| MIC | ISO 10383 market identifier code, such as XNYS |
| OHLCV | Open, high, low, close, volume |
| Par yield curve | Yields at which Treasury securities of each maturity would price at par |
| Provenance | Where a value came from, when, and with what delay |
| SIC | Standard Industrial Classification code, used by the SEC |
| TTM | Trailing twelve months |
| XBRL | The tagged data format of SEC financial statements |
| 2s10s | The 10-year yield minus the 2-year yield |
