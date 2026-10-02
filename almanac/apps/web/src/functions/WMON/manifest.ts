import type { FunctionManifest } from "../types";

export const manifest: FunctionManifest = {
  code: "WMON",
  title: "Watchlist monitor",
  kind: "market",
  params: [
    {
      name: "list",
      type: "string",
      default: "core",
      positional: 0,
      help: "Watchlist name; a new name creates an empty list",
    },
  ],
  data: [],
  exports: ["csv", "tsv"],
  keywords: ["watchlist", "monitor", "quotes", "live", "ticker"],
  phase: 0,
  examples: ["WMON", "WMON list=core", 'WMON list="My Tech"'],
};
