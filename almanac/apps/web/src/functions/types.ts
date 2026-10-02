// Function framework contract. A function is a folder holding a manifest and a view; the
// framework does parsing, data fetching, streaming, hot links and exports, so a view only draws.
import type { AssetClass, Cell, Instrument, Series, Table, Unavailable } from "../data/api";

export type FunctionKind = "security" | "market" | "tool";

export interface ParamSpec {
  name: string; // "period"
  type: "enum" | "string" | "number" | "date" | "security" | "securities" | "country";
  values?: string[]; // for enums
  default?: string;
  positional?: number; // binding order for positional arguments
  rest?: boolean; // the last positional parameter takes all remaining words
  help: string;
}

export interface DataNeed {
  key: string; // name the view reads
  shape: "reference" | "history" | "bulk" | "stream";
  fields: string[]; // Almanac field names
  params?: Record<string, string>; // may reference {param} values
  optional?: boolean; // the screen still renders without it
}

export type ExportFormat = "csv" | "xlsx" | "png" | "pdf" | "tsv";

export interface FunctionManifest {
  code: string; // "DESC"
  title: string; // "Security description"
  kind: FunctionKind;
  assetClasses?: AssetClass[]; // required when kind is "security"
  params: ParamSpec[];
  data: DataNeed[];
  pages?: string[]; // tab titles for multi-page functions
  exports: ExportFormat[];
  keywords: string[]; // feeds HELP and autocomplete
  phase: 0 | 1 | 2 | 3;
  examples?: string[]; // runnable commands shown by HELP; the grammar suite validates each
}

export interface HotLink {
  n: number; // 1 to 89
  label: string;
  command: string; // run in the same panel
}

export type DataResult =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "unavailable"; reasons: string[] }
  | { status: "ok"; ref?: Record<string, Cell>; series?: Series[]; table?: Table; stale?: boolean };

/** What a view hands the framework for toolbar 98 export and Ctrl+E. */
export interface ExportSource {
  title: string;
  /** Rows for CSV/TSV: a header of field names with units, then values. */
  table?: () => { columns: string[]; rows: (string | number | null)[][]; sources: string[] };
  /** Canvas for PNG export, already carrying its footer. */
  png?: () => HTMLCanvasElement | null;
}

export interface FunctionProps {
  panelId: 1 | 2 | 3 | 4 | string; // string for tiles
  instrument?: Instrument;
  params: Record<string, string>;
  data: Record<string, DataResult>; // status, value, provenance per DataNeed
  registerHotLinks: (links: HotLink[]) => void;
  registerExport: (src: ExportSource | null) => void;
  run: (command: string) => void; // run a command in this panel
  setParam: (name: string, value: string) => void; // change a parameter and re-run
  compact?: boolean; // rendered as a tile
}

export type Unavail = Unavailable;
