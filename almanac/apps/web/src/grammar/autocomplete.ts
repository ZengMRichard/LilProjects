// Local autocomplete: never waits on the network. Ranking: exact ticker, exact function code,
// ticker prefix, name prefix, fuzzy name, recent commands; recent use boosts a result.
import type { Instrument } from "../data/api";
import type { CatalogEntry } from "../functions/catalog";
import type { FunctionManifest } from "../functions/types";
import { type GrammarContext, sectorOf, tokenize } from "./parse";

export interface Suggestion {
  label: string;
  detail: string;
  badge: string;
  insert: string; // the full command-line text after accepting
  score: number;
}

export interface AutocompleteSources {
  symbols: Instrument[];
  manifests: FunctionManifest[];
  catalog: CatalogEntry[];
  recent: string[]; // newest first
  ctx: GrammarContext;
}

export const MAX_ROWS = 8;

function codesFor(src: AutocompleteSources, cls: string | null) {
  const built = new Map(src.manifests.map((m) => [m.code, m]));
  return src.catalog.filter((c) => {
    const m = built.get(c.code);
    if (cls === null) return true;
    if (c.kind !== "security") return false;
    return !m?.assetClasses || m.assetClasses.includes(cls as never);
  });
}

function argSuggestions(
  m: FunctionManifest | undefined,
  head: string,
  partial: string,
): Suggestion[] {
  if (!m) return [];
  const out: Suggestion[] = [];
  const p = partial.toUpperCase();
  for (const spec of m.params) {
    if (spec.values) {
      for (const v of spec.values) {
        const token = spec.positional !== undefined ? v : `${spec.name}=${v}`;
        if (!p || token.toUpperCase().startsWith(p))
          out.push({
            label: token,
            detail: spec.help,
            badge: "ARG",
            insert: `${head}${token} `,
            score: 50,
          });
      }
    } else {
      const token = `${spec.name}=`;
      if (!p || token.toUpperCase().startsWith(p))
        out.push({
          label: token,
          detail: spec.help,
          badge: "ARG",
          insert: `${head}${token}`,
          score: 45,
        });
    }
  }
  return out;
}

export function suggest(text: string, src: AutocompleteSources): Suggestion[] {
  const trimmed = text.replace(/^\s+/, "");
  if (!trimmed) {
    return src.recent.slice(0, MAX_ROWS).map((r) => ({
      label: r,
      detail: "recent",
      badge: "RECENT",
      insert: r,
      score: 30,
    }));
  }
  const endsWithSpace = /\s$/.test(text);
  const tokens = tokenize(trimmed);
  const partial = endsWithSpace ? "" : (tokens[tokens.length - 1] ?? "");
  const complete = endsWithSpace ? tokens : tokens.slice(0, -1);
  const headText = complete.length ? `${complete.join(" ")} ` : "";
  const manifests = new Map(src.manifests.map((m) => [m.code, m]));
  const catalog = new Map(src.catalog.map((c) => [c.code, c]));
  const fnAlias = (t: string) => src.ctx.aliases.functions[t] ?? t;

  // After a sector word: codes valid for that class, then that code's arguments.
  let sectorIdx = -1;
  for (let i = complete.length - 1; i > 0; i--) {
    if (sectorOf(complete[i], src.ctx)) {
      sectorIdx = i;
      break;
    }
  }
  if (sectorIdx > 0) {
    const cls = sectorOf(complete[sectorIdx], src.ctx);
    const after = complete.slice(sectorIdx + 1);
    if (after.length === 0) {
      return codesFor(src, cls)
        .filter((c) => c.code.startsWith(partial.toUpperCase()))
        .slice(0, MAX_ROWS)
        .map((c) => ({
          label: c.code,
          detail: `${c.title}${manifests.has(c.code) ? "" : ` (Phase ${c.phase})`}`,
          badge: "FN",
          insert: `${headText}${c.code} `,
          score: 70,
        }));
    }
    return argSuggestions(manifests.get(fnAlias(after[0])), headText, partial).slice(0, MAX_ROWS);
  }

  // After a function code in first position: its arguments.
  if (complete.length >= 1 && src.ctx.codes.has(fnAlias(complete[0]))) {
    return argSuggestions(manifests.get(fnAlias(complete[0])), headText, partial).slice(
      0,
      MAX_ROWS,
    );
  }

  const q = trimmed.toUpperCase();
  const out: Suggestion[] = [];
  const recentText = src.recent.join("\n").toUpperCase();
  for (const s of src.symbols) {
    const sym = s.symbol.toUpperCase();
    const name = s.name.toUpperCase();
    let score = 0;
    if (sym === q || s.display.toUpperCase() === q) score = 100;
    else if (s.display.toUpperCase().startsWith(q) && q.includes(" ")) score = 85;
    else if (sym.startsWith(q)) score = 80 - (sym.length - q.length);
    else if (name.startsWith(q)) score = 60;
    else if (q.length >= 3 && name.includes(q)) score = 40;
    if (!score) continue;
    if (recentText.includes(s.display.toUpperCase())) score += 10;
    out.push({
      label: s.display,
      detail: [s.name, s.mic ?? s.country].filter(Boolean).join(" · "),
      badge: s.asset_class,
      insert: `${s.display} `,
      score,
    });
  }
  if (tokens.length === 1) {
    for (const c of src.catalog) {
      const code = c.code;
      let score = 0;
      if (code === q) score = 95;
      else if (code.startsWith(q)) score = 75;
      if (!score) continue;
      out.push({
        label: code,
        detail: `${c.title}${manifests.has(code) ? "" : ` (Phase ${c.phase})`}`,
        badge: "FN",
        insert: `${code} `,
        score,
      });
    }
    for (const [alias, target] of Object.entries(src.ctx.aliases.functions)) {
      if (alias.toUpperCase().startsWith(q))
        out.push({
          label: alias.toUpperCase(),
          detail: `alias for ${target} · ${catalog.get(target)?.title ?? ""}`,
          badge: "FN",
          insert: `${alias.toUpperCase()} `,
          score: alias.toUpperCase() === q ? 94 : 74,
        });
    }
  }
  for (const r of src.recent) {
    if (r.toUpperCase().startsWith(q) && r.toUpperCase() !== q)
      out.push({ label: r, detail: "recent", badge: "RECENT", insert: r, score: 30 });
  }
  out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const seen = new Set<string>();
  const rows = out.filter((s) => {
    if (seen.has(s.label)) return false;
    seen.add(s.label);
    return true;
  });
  const top = rows.slice(0, MAX_ROWS - 1);
  top.push({
    label: `Search providers for "${trimmed}"`,
    detail: "runs a search",
    badge: "SEARCH",
    insert: trimmed,
    score: 0,
  });
  return top;
}
