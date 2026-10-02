# CHRT · Price chart

Kind: security (EQUITY, INDEX, CURNCY, CRYPTO, CMDTY, GOVT) · Phase 0

## Usage

```
<security> CHRT [period] [style=…] [vs=…] [study=…]
```

## Arguments

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `period` | 1D \| 5D \| 1M \| 3M \| 6M \| YTD \| 1Y \| 5Y \| 10Y \| MAX | 1Y | Time range; bar frequency follows it |
| `style` | line \| candle \| bar | line | Line, candlestick or OHLC bars |
| `vs` | securities |  | Comparison securities, comma-separated inside quotes; all series rebase to 0% |
| `study` | string |  | Studies, comma-separated: sma20, sma50, sma200, ema20, bb20 |

## Examples

- `AAPL US EQUITY CHRT 5Y`
- `CHRT 1Y style=candle study=sma20,bb20`
- `CHRT vs="MSFT US EQ, SPY US EQ"`
- `EURUSD FX CHRT 1Y`

## Data

- `bars`: history of `px.open`, `px.high`, `px.low`, `px.close`, `px.volume`
- `filings`: bulk of `bulk.filings` (optional)

Exports: png, csv

Keywords: chart, graph, price, candles, moving average, bollinger, compare
