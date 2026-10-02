// Generates docs/functions/<CODE>.md from each manifest plus optional hand-written notes in
// src/functions/<CODE>/notes.md. CI fails when the committed pages are stale; regenerate with
// `pnpm gen:docs`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog";
import { MANIFESTS } from "./registry";
import type { FunctionManifest } from "./types";

const DOCS = join(__dirname, "../../../../docs/functions");
const update = process.env.UPDATE_DOCS === "1";

function renderDoc(m: FunctionManifest, notes: string | null): string {
  const lines = [`# ${m.code} · ${m.title}`, ""];
  lines.push(
    `Kind: ${m.kind}${m.assetClasses ? ` (${m.assetClasses.join(", ")})` : ""} · Phase ${m.phase}`,
  );
  lines.push("");
  const pos = m.params.filter((p) => p.positional !== undefined).map((p) => `[${p.name}]`);
  const named = m.params.filter((p) => p.positional === undefined).map((p) => `[${p.name}=…]`);
  lines.push(
    "## Usage",
    "",
    "```",
    [m.kind === "security" ? "<security>" : "", m.code, ...pos, ...named].filter(Boolean).join(" "),
    "```",
    "",
  );
  if (m.params.length) {
    lines.push(
      "## Arguments",
      "",
      "| Name | Type | Default | Description |",
      "| --- | --- | --- | --- |",
    );
    for (const p of m.params) {
      const type = p.values ? p.values.join(" \\| ") : p.type;
      lines.push(`| \`${p.name}\` | ${type} | ${p.default ?? ""} | ${p.help} |`);
    }
    lines.push("");
  }
  if (m.examples?.length) {
    lines.push("## Examples", "", ...m.examples.map((e) => `- \`${e}\``), "");
  }
  lines.push("## Data", "");
  if (m.data.length) {
    for (const d of m.data)
      lines.push(
        `- \`${d.key}\`: ${d.shape} of ${d.fields.map((f) => `\`${f}\``).join(", ")}${d.optional ? " (optional)" : ""}`,
      );
  } else lines.push("- Local state only.");
  lines.push("", `Exports: ${m.exports.length ? m.exports.join(", ") : "none"}`, "");
  lines.push(`Keywords: ${m.keywords.join(", ")}`, "");
  if (notes) lines.push("## Notes", "", notes.trim(), "");
  return lines.join("\n");
}

function renderIndex(): string {
  const built = new Set(MANIFESTS.map((m) => m.code));
  const lines = [
    "# Function catalog",
    "",
    "Generated from the manifests and the planned catalog.",
    "",
    "| Code | Title | Kind | Phase | Status |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const c of CATALOG) {
    const link = built.has(c.code) ? `[${c.code}](${c.code}.md)` : c.code;
    lines.push(
      `| ${link} | ${c.title} | ${c.kind} | ${c.phase} | ${built.has(c.code) ? "built" : "planned"} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

describe("function docs", () => {
  if (update) mkdirSync(DOCS, { recursive: true });
  const pages: [string, string][] = [
    ["README.md", renderIndex()],
    ...MANIFESTS.map((m): [string, string] => {
      const notesPath = join(__dirname, m.code, "notes.md");
      const notes = existsSync(notesPath) ? readFileSync(notesPath, "utf8") : null;
      return [`${m.code}.md`, renderDoc(m, notes)];
    }),
  ];
  for (const [name, body] of pages) {
    it(`${name} is up to date`, () => {
      const path = join(DOCS, name);
      if (update) writeFileSync(path, body);
      expect(existsSync(path), `missing ${path}; run pnpm gen:docs`).toBe(true);
      expect(readFileSync(path, "utf8"), "stale; run pnpm gen:docs").toBe(body);
    });
  }
});
