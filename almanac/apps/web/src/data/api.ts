// Typed client for the local Almanac API. Types come from the server's OpenAPI schema
// (src/data/schema.d.ts, regenerated with `pnpm gen:api`), never written by hand.
import type { components } from "./schema";

type S = components["schemas"];
export type Instrument = S["Instrument"];
export type Value = S["Value"];
export type Unavailable = S["Unavailable"];
export type Provenance = S["Provenance"];
export type Series = S["Series"];
export type Table = S["Table"];
export type Resolution = S["Resolution"];
export type FieldDef = S["FieldDef"];
export type SessionInfo = S["SessionInfo"];
export type HistoryEntry = S["HistoryEntry"];
export type HistRequest = S["HistRequest"];
export type ProviderInfo = S["ProviderInfo"];
export type AssetClass = Instrument["asset_class"];
export type Cell = Value | Unavailable;

const TOKEN_KEY = "almanac.token";

/** The session token arrives in the URL fragment from `almanac start`; keep it, then hide it. */
export function initToken(): string | null {
  const m = location.hash.match(/token=([^&]+)/);
  if (m) {
    try {
      localStorage.setItem(TOKEN_KEY, m[1]);
    } catch {
      /* storage blocked: keep it in memory for this page only */
      memoryToken = m[1];
    }
    const rest = location.hash
      .replace(/^#/, "")
      .split("&")
      .filter((p) => !p.startsWith("token="))
      .join("&");
    history.replaceState(null, "", rest ? `#${rest}` : location.pathname + location.search);
  }
  return token();
}

let memoryToken: string | null = null;

export function token(): string | null {
  const dev = import.meta.env.VITE_ALMANAC_TOKEN as string | undefined;
  try {
    return localStorage.getItem(TOKEN_KEY) ?? memoryToken ?? dev ?? null;
  } catch {
    return memoryToken ?? dev ?? null;
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, signal?: AbortSignal) {
  const res = await fetch(path, {
    method,
    signal,
    headers: {
      "X-Almanac-Token": token() ?? "",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return (await res.json()) as T;
}

export const api = {
  session: () => call<SessionInfo>("GET", "/v1/session"),
  symbols: () => call<Instrument[]>("GET", "/v1/symbols"),
  resolve: (q: string, signal?: AbortSignal) =>
    call<Resolution>("GET", `/v1/resolve?q=${encodeURIComponent(q)}`, undefined, signal),
  ref: (ids: string[], fields: string[], signal?: AbortSignal) =>
    call<S["RefResponse"]>("POST", "/v1/ref", { ids, fields }, signal),
  hist: (req: HistRequest, signal?: AbortSignal) =>
    call<S["HistResponse"]>("POST", "/v1/hist", req, signal),
  bulk: (id: string, field: string, params: Record<string, string>, signal?: AbortSignal) =>
    call<S["BulkResponse"]>("POST", "/v1/bulk", { id, field, params }, signal),
  fields: (q = "") => call<FieldDef[]>("GET", `/v1/fields?q=${encodeURIComponent(q)}`),
  providers: () => call<ProviderInfo[]>("GET", "/v1/providers"),
  getState: <T = unknown>(kind: string) => call<Record<string, T>>("GET", `/v1/state/${kind}`),
  putState: (kind: string, key: string, value: unknown) =>
    call<Record<string, unknown>>("PUT", `/v1/state/${kind}`, { key, value }),
  deleteState: (kind: string, key: string) =>
    call<Record<string, unknown>>("DELETE", `/v1/state/${kind}/${encodeURIComponent(key)}`),
  history: (limit = 50) => call<HistoryEntry[]>("GET", `/v1/state/history?limit=${limit}`),
  addHistory: (panel: string, command: string) =>
    call<HistoryEntry>("POST", "/v1/state/history", { panel, command }),
};

export function isValue(c: Cell | undefined | null): c is Value {
  return !!c && !("unavailable" in c);
}

export function num(c: Cell | undefined | null): number | null {
  return isValue(c) && typeof c.value === "number" ? c.value : null;
}
