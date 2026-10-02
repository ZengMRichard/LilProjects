import type { FunctionManifest } from "../types";

export const manifest: FunctionManifest = {
  code: "RECENT",
  title: "Command history",
  kind: "tool",
  params: [],
  data: [],
  exports: ["csv"],
  keywords: ["history", "last", "recent", "commands"],
  phase: 0,
  examples: ["RECENT"],
};
