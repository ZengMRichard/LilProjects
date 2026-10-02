// File exports built in the browser: CSV with optional "# source:" provenance lines, TSV for
// the clipboard, and PNG with a footer naming title, security, time and source.
import type { ExportSource } from "../functions/types";

type CellV = string | number | null | undefined;

function csvCell(v: CellV): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(
  columns: string[],
  rows: CellV[][],
  sources: string[] = [],
  withSources = true,
): string {
  const lines = withSources ? sources.map((s) => `# source: ${s.replace(/^Source:\s*/, "")}`) : [];
  lines.push(columns.map(csvCell).join(","));
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  return `${lines.join("\n")}\n`;
}

export function toTsv(columns: string[] | null, rows: CellV[][]): string {
  const clean = (v: CellV) =>
    v === null || v === undefined ? "" : String(v).replace(/[\t\n]/g, " ");
  const lines = columns ? [columns.map(clean).join("\t")] : [];
  for (const r of rows) lines.push(r.map(clean).join("\t"));
  return lines.join("\n");
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function download(name: string, data: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(data);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function exportCsv(src: ExportSource) {
  const t = src.table?.();
  if (!t) return false;
  download(
    `${slug(src.title)}.csv`,
    new Blob([toCsv(t.columns, t.rows, t.sources)], { type: "text/csv" }),
  );
  return true;
}

export function exportPng(src: ExportSource) {
  const c = src.png?.();
  if (!c) return false;
  c.toBlob((b) => b && download(`${slug(src.title)}.png`, b), "image/png");
  return true;
}

/** Copy a canvas onto a larger one with a footer line underneath. */
export function withFooter(canvas: HTMLCanvasElement, footer: string, bg: string, fg: string) {
  const pad = 28;
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height + pad;
  const ctx = out.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  ctx.fillStyle = fg;
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillText(footer, 8, canvas.height + 18);
  return out;
}
