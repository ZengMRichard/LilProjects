// Binds parsed arguments to a manifest's parameters. Positional arguments bind in the order
// the manifest declares; name=value binds by name. Unknown arguments are errors with
// suggestions, never silently dropped.
import type { FunctionManifest } from "../functions/types";

export type BindResult =
  | { ok: true; params: Record<string, string> }
  | { ok: false; error: string; suggestions: string[] };

export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[a.length][b.length];
}

export function nearest(word: string, options: string[], n = 3): string[] {
  const w = word.toUpperCase();
  return options
    .map((o) => ({
      o,
      d: o.toUpperCase().startsWith(w) ? 0 : editDistance(w, o.toUpperCase()),
    }))
    .filter((x) => x.d <= Math.max(2, Math.floor(w.length / 2)))
    .sort((a, b) => a.d - b.d || a.o.localeCompare(b.o))
    .slice(0, n)
    .map((x) => x.o);
}

function canonical(spec: FunctionManifest["params"][number], raw: string): string | null {
  if (spec.type === "enum") {
    const hit = spec.values?.find((v) => v.toUpperCase() === raw.toUpperCase());
    return hit ?? null;
  }
  if (spec.type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  if (spec.type === "number") return Number.isFinite(Number(raw)) ? raw : null;
  if (spec.type === "country") return /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : null;
  return raw;
}

export function bindArgs(
  m: FunctionManifest,
  positional: string[],
  named: Record<string, string>,
): BindResult {
  const params: Record<string, string> = {};
  const byName = new Map(m.params.map((p) => [p.name, p]));
  const order = m.params
    .filter((p) => p.positional !== undefined)
    .sort((a, b) => a.positional! - b.positional!);

  for (const [name, raw] of Object.entries(named)) {
    const spec = byName.get(name);
    if (!spec) {
      return {
        ok: false,
        error: `${m.code} has no argument "${name}".`,
        suggestions: nearest(name, [...byName.keys()]).map((s) => `${s}=`),
      };
    }
    const v = canonical(spec, raw);
    if (v === null) {
      return {
        ok: false,
        error: `${raw} is not a valid ${name} for ${m.code}.`,
        suggestions: spec.values ? spec.values.map((x) => `${name}=${x}`) : [],
      };
    }
    params[name] = v;
  }

  let slot = 0;
  const last = order[order.length - 1];
  if (last?.rest && positional.length >= order.length) {
    positional = [
      ...positional.slice(0, order.length - 1),
      positional.slice(order.length - 1).join(" "),
    ];
  }
  for (const raw of positional) {
    while (slot < order.length && order[slot].name in params) slot++;
    const spec = order[slot];
    if (!spec) {
      return {
        ok: false,
        error: `Unexpected argument ${raw} for ${m.code}.`,
        suggestions: m.params.map((p) => `${p.name}=`),
      };
    }
    const v = canonical(spec, raw);
    if (v === null) {
      return {
        ok: false,
        error: `${raw} is not a valid ${spec.name} for ${m.code}.`,
        suggestions: spec.values ?? [],
      };
    }
    params[spec.name] = v;
    slot++;
  }

  for (const p of m.params)
    if (!(p.name in params) && p.default !== undefined) params[p.name] = p.default;
  return { ok: true, params };
}

/** Render bound params back into a command tail: positional first, then name=value. */
export function formatArgs(m: FunctionManifest, params: Record<string, string>): string {
  const parts: string[] = [];
  const order = m.params
    .filter((p) => p.positional !== undefined)
    .sort((a, b) => a.positional! - b.positional!);
  const used = new Set<string>();
  for (const p of order) {
    if (params[p.name] !== undefined && params[p.name] !== p.default) {
      parts.push(params[p.name]);
      used.add(p.name);
    } else break;
  }
  for (const p of m.params) {
    const v = params[p.name];
    if (used.has(p.name) || v === undefined || v === p.default) continue;
    parts.push(/[\s,]/.test(v) ? `${p.name}="${v}"` : `${p.name}=${v}`);
  }
  return parts.join(" ");
}
