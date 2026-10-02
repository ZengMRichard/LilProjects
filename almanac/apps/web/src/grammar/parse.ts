// Command grammar. Mirrors server/almanac/core/grammar.py; both run the shared fixtures in
// packages/grammar-fixtures so the two implementations cannot drift.
//
//   command    = hotlink | invocation | search ;
//   invocation = security , [ function ] | function ;
//   security   = token , { token } , sector ;
//   function   = code , { argument } ;
//   argument   = name , "=" , value | value ;

export const SECTORS = [
  "EQUITY",
  "INDEX",
  "GOVT",
  "CORP",
  "CMDTY",
  "CURNCY",
  "CRYPTO",
  "ECON",
  "MUNI",
  "PFD",
  "MTGE",
  "MMKT",
] as const;
export type Sector = (typeof SECTORS)[number];

export const SECTOR_ALIASES: Record<string, Sector> = {
  EQ: "EQUITY",
  IX: "INDEX",
  GV: "GOVT",
  CP: "CORP",
  CM: "CMDTY",
  FX: "CURNCY",
  CR: "CRYPTO",
  EC: "ECON",
};

export interface Aliases {
  functions: Record<string, string>;
  sectors: Record<string, string>;
  securities: Record<string, string>;
}

export interface GrammarContext {
  codes: Set<string>;
  aliases: Aliases;
}

export type Parsed =
  | { kind: "empty" }
  | { kind: "hotlink"; n: number }
  | { kind: "search"; text: string }
  | {
      kind: "invocation";
      security: string | null;
      sector: string | null;
      code: string | null;
      positional: string[];
      named: Record<string, string>;
    };

const NAMED = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/;
const DIGITS = /^[0-9]+$/;

export const emptyAliases = (): Aliases => ({ functions: {}, sectors: {}, securities: {} });

/** Split on whitespace outside quotes; uppercase outside quotes; strip the quotes. */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let inQuote = false;
  let has = false;
  for (const ch of text) {
    if (ch === '"') {
      inQuote = !inQuote;
      has = true;
      continue;
    }
    if (!inQuote && /\s/.test(ch)) {
      if (has) {
        tokens.push(cur);
        cur = "";
        has = false;
      }
      continue;
    }
    cur += inQuote ? ch : ch.toUpperCase();
    has = true;
  }
  if (has) tokens.push(cur);
  return tokens;
}

const upperKeys = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toUpperCase(), v.toUpperCase()]));

export function sectorOf(token: string, ctx: GrammarContext): string | null {
  if ((SECTORS as readonly string[]).includes(token)) return token;
  if (token in SECTOR_ALIASES) return SECTOR_ALIASES[token];
  return upperKeys(ctx.aliases.sectors)[token] ?? null;
}

function splitArgs(tokens: string[]) {
  const positional: string[] = [];
  const named: Record<string, string> = {};
  for (const t of tokens) {
    const m = NAMED.exec(t);
    if (m) named[m[1].toLowerCase()] = m[2];
    else positional.push(t);
  }
  return { positional, named };
}

export function parse(raw: string, ctx: GrammarContext): Parsed {
  const text = raw.split(/\s+/).filter(Boolean).join(" ");
  if (!text) return { kind: "empty" };
  if (DIGITS.test(text)) return { kind: "hotlink", n: Number(text) };

  let tokens = tokenize(text);
  if (!tokens.length) return { kind: "empty" };

  // User security aliases expand in first position: OIL -> WTI CMDTY.
  const secAliases = Object.fromEntries(
    Object.entries(ctx.aliases.securities).map(([k, v]) => [k.toUpperCase(), v]),
  );
  if (tokens[0] in secAliases) tokens = [...tokenize(secAliases[tokens[0]]), ...tokens.slice(1)];

  // Only tokens before the first name=value argument can hold the security and code.
  let headEnd = tokens.findIndex((t) => NAMED.test(t));
  if (headEnd < 0) headEnd = tokens.length;

  let sectorIdx = -1;
  for (let i = headEnd - 1; i > 0; i--) {
    if (sectorOf(tokens[i], ctx)) {
      sectorIdx = i;
      break;
    }
  }

  const fnAliases = upperKeys(ctx.aliases.functions);
  if (sectorIdx > 0) {
    const security = tokens.slice(0, sectorIdx).join(" ");
    const sector = sectorOf(tokens[sectorIdx], ctx);
    let rest = tokens.slice(sectorIdx + 1);
    let code: string | null = null;
    if (rest.length && !NAMED.test(rest[0])) {
      code = fnAliases[rest[0]] ?? rest[0];
      rest = rest.slice(1);
    }
    return { kind: "invocation", security, sector, code, ...splitArgs(rest) };
  }

  const first = fnAliases[tokens[0]] ?? tokens[0];
  if (ctx.codes.has(first)) {
    return {
      kind: "invocation",
      security: null,
      sector: null,
      code: first,
      ...splitArgs(tokens.slice(1)),
    };
  }
  return { kind: "search", text: tokens.join(" ") };
}
