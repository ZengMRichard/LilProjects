# HIST · Price history table

Kind: security (EQUITY, INDEX, CURNCY, CRYPTO, CMDTY, GOVT) · Phase 0

## Usage

```
<security> HIST [period] [start=…] [end=…] [freq=…] [ccy=…]
```

## Arguments

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `period` | 1M \| 3M \| 6M \| YTD \| 1Y \| 5Y \| 10Y \| MAX | 1Y | Time range, unless start and end are given |
| `start` | date |  | First date, YYYY-MM-DD |
| `end` | date |  | Last date, YYYY-MM-DD |
| `freq` | 1d \| 1w \| 1mo | 1d | Daily, weekly or monthly bars |
| `ccy` | string |  | Convert prices to this ISO currency |

## Examples

- `AAPL US EQUITY HIST`
- `HIST 5Y freq=1mo`
- `HIST start=2024-01-01 end=2024-06-30 ccy=EUR`

## Data

- `bars`: history of `px.open`, `px.high`, `px.low`, `px.close`, `px.volume`

Exports: csv, tsv

Keywords: history, prices, table, ohlc, daily, weekly, monthly
