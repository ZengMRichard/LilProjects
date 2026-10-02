// Turns API series into chart bars. Pure, so the transform is unit-tested.
import type { Time, UTCTimestamp } from "lightweight-charts";
import type { Series } from "../../data/api";

export interface Bar {
  t: Time;
  ts: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
}

export const INTRADAY = new Set(["1D", "5D"]);

export function toTime(ts: string, intraday: boolean): Time {
  if (!intraday) return ts.slice(0, 10) as Time;
  // Lightweight Charts draws timestamps in UTC; shift so axis labels read in the user's zone.
  const d = new Date(ts);
  return (d.getTime() / 1000 - d.getTimezoneOffset() * 60) as UTCTimestamp;
}

export function toBars(series: Series[] | undefined, intraday: boolean): Bar[] {
  if (!series) return [];
  const by = Object.fromEntries(series.map((s) => [s.field, s.points]));
  const close = by["px.close"] ?? [];
  return close
    .map((p, i) => ({
      t: toTime(p.ts, intraday),
      ts: p.ts,
      o: by["px.open"]?.[i]?.value ?? p.value ?? Number.NaN,
      h: by["px.high"]?.[i]?.value ?? p.value ?? Number.NaN,
      l: by["px.low"]?.[i]?.value ?? p.value ?? Number.NaN,
      c: p.value ?? Number.NaN,
      v: by["px.volume"]?.[i]?.value ?? null,
    }))
    .filter((b) => Number.isFinite(b.c));
}
