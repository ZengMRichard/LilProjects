# DESC · Security description

Kind: security (EQUITY) · Phase 0

## Usage

```
<security> DESC [page]
```

## Arguments

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `page` | profile \| stats \| ids | profile | Which page to open |

## Examples

- `AAPL US EQUITY DESC`
- `MSFT US EQ DESC stats`
- `DESC page=ids`

## Data

- `ref`: reference of `ref.name`, `ref.currency`, `ref.country`, `ref.mic`, `ref.sic`, `ref.industry`, `ref.description`, `ref.cik`, `ref.figi`, `px.last`, `px.chg`, `px.chg_pct`, `px.hi_52w`, `px.lo_52w`, `px.volume`, `val.mkt_cap`, `val.pe_ttm`, `val.div_yield`, `fin.shares_out`
- `spark`: history of `px.close` (optional)
- `filings`: bulk of `bulk.filings` (optional)
- `live`: stream of `px.last`, `px.chg`, `px.chg_pct` (optional)

Exports: csv

Keywords: description, profile, statistics, market cap, p/e, company
