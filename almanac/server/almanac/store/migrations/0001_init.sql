-- Symbol master with a full-text index, local state, command history and quota ledger.

CREATE TABLE symbols (
    id          TEXT PRIMARY KEY,
    asset_class TEXT NOT NULL,
    symbol      TEXT NOT NULL,
    display     TEXT NOT NULL,
    name        TEXT NOT NULL,
    currency    TEXT,
    mic         TEXT,
    country     TEXT,
    identifiers TEXT NOT NULL DEFAULT '{}',
    provider_symbols TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX symbols_display ON symbols (display);
CREATE INDEX symbols_symbol ON symbols (symbol);

CREATE VIRTUAL TABLE symbols_fts USING fts5 (
    id UNINDEXED, symbol, display, name, tokenize = 'unicode61'
);

CREATE TABLE state (
    kind       TEXT NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (kind, key)
);

CREATE TABLE history (
    seq     INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      TEXT NOT NULL,
    panel   TEXT NOT NULL,
    command TEXT NOT NULL
);

CREATE TABLE quota (
    provider TEXT NOT NULL,
    day      TEXT NOT NULL,
    used     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (provider, day)
);
