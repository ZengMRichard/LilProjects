import type { FunctionManifest } from "../types";

export const manifest: FunctionManifest = {
  code: "HELP",
  title: "Help and function search",
  kind: "tool",
  params: [
    {
      name: "q",
      type: "string",
      positional: 0,
      rest: true,
      help: "A function code or words to search for",
    },
  ],
  data: [],
  exports: [],
  keywords: ["help", "search", "functions", "documentation", "how"],
  phase: 0,
  examples: ["HELP", "HELP CHRT", "HELP yield", "HELP balance sheet"],
};
