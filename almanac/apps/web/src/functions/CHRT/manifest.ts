import type { FunctionManifest } from "../types";

export const PERIODS = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "10Y", "MAX"];
/** Range links 1 to 8 on the chart, in order. */
export const RANGE_LINKS = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"];

export const manifest: FunctionManifest = {
  code: "CHRT",
  title: "Price chart",
  kind: "security",
  assetClasses: ["EQUITY", "INDEX", "CURNCY", "CRYPTO", "CMDTY", "GOVT"],
  params: [
    {
      name: "period",
      type: "enum",
      values: PERIODS,
      default: "1Y",
      positional: 0,
      help: "Time range; bar frequency follows it",
    },
    {
      name: "style",
      type: "enum",
      values: ["line", "candle", "bar"],
      default: "line",
      help: "Line, candlestick or OHLC bars",
    },
    {
      name: "vs",
      type: "securities",
      help: "Comparison securities, comma-separated inside quotes; all series rebase to 0%",
    },
    {
      name: "study",
      type: "string",
      help: "Studies, comma-separated: sma20, sma50, sma200, ema20, bb20",
    },
  ],
  data: [
    {
      key: "bars",
      shape: "history",
      fields: ["px.open", "px.high", "px.low", "px.close", "px.volume"],
      params: { period: "{period}" },
    },
    {
      key: "filings",
      shape: "bulk",
      fields: ["bulk.filings"],
      params: { form: "10-K,10-Q,8-K" },
      optional: true,
    },
  ],
  exports: ["png", "csv"],
  keywords: ["chart", "graph", "price", "candles", "moving average", "bollinger", "compare"],
  phase: 0,
  examples: [
    "AAPL US EQUITY CHRT 5Y",
    "CHRT 1Y style=candle study=sma20,bb20",
    'CHRT vs="MSFT US EQ, SPY US EQ"',
    "EURUSD FX CHRT 1Y",
  ],
};
