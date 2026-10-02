# Almanac

An open-source, keyboard-first financial terminal that runs on your own machine. Almanac is
inspired by professional market terminals: one command line drives four panels of dense,
numbered screens, and every number tells you where it came from.

> **Data may be delayed or wrong. Nothing in Almanac is investment advice.** In demo mode every
> price is synthetic.

**Status:** Phase 0 (skeleton on demo data) is built and its gate passes. Live public-data
providers (SEC EDGAR, FRED, U.S. Treasury, ECB, Alpha Vantage) arrive in Phase 1. See
[docs/PROGRESS.md](docs/PROGRESS.md).

## Quick start

Requires [uv](https://docs.astral.sh/uv/) and Node 22 with pnpm.

```sh
cd almanac
uv sync && pnpm install
pnpm -C apps/web build
uv run almanac demo        # opens http://127.0.0.1:8765 with a session token
```

## Using it

Type into the command bar; it always targets the focused panel (Alt+1 to Alt+4).

| Type | Opens |
| --- | --- |
| `AAPL US EQUITY` | The security's description (DESC) |
| `aapl us eq chrt 5y` | A five-year chart; case and aliases fold |
| `CHRT 1Y style=candle study=sma20,bb20` | Candles with studies for the panel's loaded security |
| `CHRT vs="MSFT US EQ, SPY US EQ"` | The loaded security against two others, rebased to 0% |
| `EURUSD FX HIST freq=1w` | Weekly price history |
| `WMON` | A live watchlist monitor |
| `HELP yield` | Function search |
| `RECENT` | The last 50 commands |
| `3` | Link 3 on the focused screen; `90`–`99` are panel toolbar actions |
| `apple` | A search with numbered picks |

Keys: Enter runs, Tab completes, Esc closes suggestions then clears, Up and Down walk the panel's
history, Ctrl+[ and Ctrl+] go back and forward, F1 opens help, Ctrl+E exports (Ctrl+Shift+E as
CSV), Ctrl+C copies a grid.

Phase 0 functions: **HELP**, **RECENT**, **DESC**, **CHRT**, **HIST** and **WMON**. The other 24
codes in the catalog parse and say which phase delivers them. Per-function docs are in
[docs/functions](docs/functions/README.md).

Personal shortcuts go in `~/.almanac/aliases.toml`:

```toml
[functions]
PX = "CHRT"

[securities]
OIL = "WTI CMDTY"
TENS = "UST10Y GOVT"
```

## How it works

A Python server bound to 127.0.0.1 owns data access, provenance and streaming. A React app owns the
command line, panels and rendering. Functions request fields (`px.last`, `val.mkt_cap`), never
vendors; a router picks the provider and stamps provenance on every value, and anything it cannot
answer shows as a dash with the reason. Every request carries a session token, and the server
checks Host and Origin headers.

```
apps/web/src/       shell/ grammar/ functions/<CODE>/ ui/ data/
server/almanac/     api/ core/ providers/ analytics/ store/
packages/grammar-fixtures/   parser cases shared by the TypeScript and Python suites
fixtures/demo/      the demo symbol master and reference data
docs/               SPEC.md (build spec), PROGRESS.md, DECISIONS.md, functions/
```

Development commands are in [CLAUDE.md](CLAUDE.md); the full build spec is in
[docs/SPEC.md](docs/SPEC.md).

## License

Apache-2.0. Third-party attributions are in [NOTICE](NOTICE); charts are by
[TradingView](https://www.tradingview.com/) Lightweight Charts. No telemetry is collected.
