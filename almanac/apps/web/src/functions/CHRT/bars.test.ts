import { describe, expect, it } from "vitest";
import type { Series } from "../../data/api";
import { toBars } from "./bars";

const prov = { provider: "demo", fetched_at: "2026-09-30T18:00:00Z" };
const s = (field: string, values: (number | null)[]): Series => ({
  instrument_id: "EQUITY:US:AAPL",
  field,
  freq: "1d",
  currency: "USD",
  prov,
  points: values.map((value, i) => ({
    ts: `2026-09-${String(28 + i).padStart(2, "0")}T00:00:00Z`,
    value,
  })),
});

describe("CHRT bar transform", () => {
  it("candles match the fixture bars exactly", () => {
    const series = [
      s("px.open", [10, 11, 12]),
      s("px.high", [12, 13, 14]),
      s("px.low", [9, 10, 11]),
      s("px.close", [11, 12, 13]),
      s("px.volume", [100, 200, null]),
    ];
    expect(toBars(series, false)).toEqual([
      { t: "2026-09-28", ts: "2026-09-28T00:00:00Z", o: 10, h: 12, l: 9, c: 11, v: 100 },
      { t: "2026-09-29", ts: "2026-09-29T00:00:00Z", o: 11, h: 13, l: 10, c: 12, v: 200 },
      { t: "2026-09-30", ts: "2026-09-30T00:00:00Z", o: 12, h: 14, l: 11, c: 13, v: null },
    ]);
  });
  it("drops bars with no close rather than inventing one", () => {
    expect(toBars([s("px.close", [11, null, 13])], false).map((b) => b.c)).toEqual([11, 13]);
  });
});
