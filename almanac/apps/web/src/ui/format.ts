// Number and date formatting. Numbers are right-aligned with tabular figures; decimals follow
// the field: prices to the instrument's tick, FX 4 or 5 places, yields 3, percentages 2.
import type { AssetClass, Instrument, Provenance } from "../data/api";

export const DASH = "—";

export function priceDecimals(
  inst?: Pick<Instrument, "asset_class" | "symbol"> | null,
  v?: number,
) {
  const cls: AssetClass | undefined = inst?.asset_class;
  if (cls === "CURNCY") return inst?.symbol.includes("JPY") ? 3 : 5;
  if (cls === "GOVT" || cls === "CURVE") return 3;
  if (v !== undefined && Math.abs(v) < 1) return 4;
  if (v !== undefined && Math.abs(v) < 10 && (cls === "CMDTY" || cls === "CRYPTO")) return 3;
  return 2;
}

export function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtPrice(v: number | null | undefined, inst?: Instrument | null): string {
  if (v === null || v === undefined) return DASH;
  return fmtNum(v, priceDecimals(inst, v));
}

/** Changes are always signed: +1.23, -0.40. */
export function fmtSigned(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  const s = fmtNum(Math.abs(v), decimals);
  if (v > 0) return `+${s}`;
  if (v < 0) return `-${s}`;
  return s;
}

export function fmtPct(v: number | null | undefined, signed = true): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return `${signed ? fmtSigned(v, 2) : fmtNum(v, 2)}%`;
}

/** Large values abbreviated K, M, B, T for overviews; tables and exports keep full precision. */
export function fmtAbbrev(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  const a = Math.abs(v);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [n, u] of units)
    if (a >= n) return `${v < 0 ? "-" : ""}${fmtNum(a / n, decimals)}${u}`;
  return fmtNum(v, a < 1 ? 4 : decimals);
}

export function fmtInt(v: number | null | undefined): string {
  return fmtNum(v, 0);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Dates as YYYY-MM-DD. */
export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return DASH;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Times in 24-hour format in the given zone (default: the user's). */
export function fmtTime(iso: string | Date | null | undefined, tz?: string, seconds = false) {
  if (!iso) return DASH;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: seconds ? "2-digit" : undefined,
    hour12: false,
    timeZone: tz,
  });
}

export function fmtDateTime(iso: string | null | undefined, tz?: string): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }).format(d);
  return `${parts} ${fmtTime(d, tz)}`;
}

/** Hover text for any number: where it came from, when, and with what delay. */
export function provenanceText(p: Provenance | undefined | null): string {
  if (!p) return "";
  const parts = [`Source: ${p.provider}`];
  if (p.as_of) parts.push(`as of ${fmtDateTime(p.as_of)}`);
  parts.push(
    p.delay_minutes === 0
      ? "real-time"
      : p.delay_minutes
        ? `delayed ${p.delay_minutes} min`
        : "delay unknown",
  );
  if (p.adjusted !== null && p.adjusted !== undefined)
    parts.push(p.adjusted ? "adjusted" : "unadjusted");
  if (p.attribution) parts.push(p.attribution);
  return parts.join(" · ");
}
