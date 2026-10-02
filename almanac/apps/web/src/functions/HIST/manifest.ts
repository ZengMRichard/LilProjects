import type { FunctionManifest } from "../types";

export const manifest: FunctionManifest = {
  code: "HIST",
  title: "Price history table",
  kind: "security",
  assetClasses: ["EQUITY", "INDEX", "CURNCY", "CRYPTO", "CMDTY", "GOVT"],
  params: [
    {
      name: "period",
      type: "enum",
      values: ["1M", "3M", "6M", "YTD", "1Y", "5Y", "10Y", "MAX"],
      default: "1Y",
      positional: 0,
      help: "Time range, unless start and end are given",
    },
    { name: "start", type: "date", help: "First date, YYYY-MM-DD" },
    { name: "end", type: "date", help: "Last date, YYYY-MM-DD" },
    {
      name: "freq",
      type: "enum",
      values: ["1d", "1w", "1mo"],
      default: "1d",
      help: "Daily, weekly or monthly bars",
    },
    { name: "ccy", type: "string", help: "Convert prices to this ISO currency" },
  ],
  data: [
    {
      key: "bars",
      shape: "history",
      fields: ["px.open", "px.high", "px.low", "px.close", "px.volume"],
      params: { period: "{period}", start: "{start}", end: "{end}", freq: "{freq}", ccy: "{ccy}" },
    },
  ],
  exports: ["csv", "tsv"],
  keywords: ["history", "prices", "table", "ohlc", "daily", "weekly", "monthly"],
  phase: 0,
  examples: [
    "AAPL US EQUITY HIST",
    "HIST 5Y freq=1mo",
    "HIST start=2024-01-01 end=2024-06-30 ccy=EUR",
  ],
};
