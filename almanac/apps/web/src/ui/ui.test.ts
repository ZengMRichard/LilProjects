import { describe, expect, it } from "vitest";
import { toCsv, toTsv } from "./export";
import { fmtAbbrev, fmtDate, fmtPct, fmtPrice, fmtSigned, provenanceText } from "./format";
import { bollinger, ema, rebase, sma } from "./studies";

describe("format", () => {
  it("signs changes and percentages", () => {
    expect(fmtSigned(1.234)).toBe("+1.23");
    expect(fmtSigned(-0.4)).toBe("-0.40");
    expect(fmtPct(1.2345)).toBe("+1.23%");
    expect(fmtPct(null)).toBe("—");
  });
  it("uses decimals by instrument", () => {
    expect(fmtPrice(1.08123, { asset_class: "CURNCY", symbol: "EURUSD" } as never)).toBe("1.08123");
    expect(fmtPrice(151.2, { asset_class: "CURNCY", symbol: "USDJPY" } as never)).toBe("151.200");
    expect(fmtPrice(4.5678, { asset_class: "GOVT", symbol: "UST10Y" } as never)).toBe("4.568");
    expect(fmtPrice(1234.5, { asset_class: "EQUITY", symbol: "AAPL" } as never)).toBe("1,234.50");
  });
  it("abbreviates large values", () => {
    expect(fmtAbbrev(3.55e12)).toBe("3.55T");
    expect(fmtAbbrev(-2.5e9)).toBe("-2.50B");
    expect(fmtAbbrev(12_300)).toBe("12.30K");
  });
  it("formats dates as YYYY-MM-DD", () => {
    expect(fmtDate("2026-09-30T00:00:00Z")).toBe("2026-09-30");
  });
  it("describes provenance", () => {
    const t = provenanceText({
      provider: "demo",
      fetched_at: "2026-09-30T18:00:00Z",
      as_of: null,
      delay_minutes: null,
      adjusted: true,
      attribution: "Synthetic",
    });
    expect(t).toBe("Source: demo · delay unknown · adjusted · Synthetic");
  });
});

describe("studies", () => {
  const xs = [1, 2, 3, 4, 5, 6];
  it("sma", () => expect(sma(xs, 3)).toEqual([null, null, 2, 3, 4, 5]));
  it("ema seeds with the sma", () => {
    const e = ema(xs, 3);
    expect(e.slice(0, 3)).toEqual([null, null, 2]);
    expect(e[3]).toBeCloseTo(3);
  });
  it("bollinger bands bracket the mean", () => {
    const b = bollinger([1, 3, 1, 3, 1, 3], 2, 2);
    expect(b.mid[1]).toBe(2);
    expect(b.upper[1]).toBe(4);
    expect(b.lower[1]).toBe(0);
  });
  it("rebases to 0% at the first visible point", () => {
    expect(rebase([null, 50, 75, 25])).toEqual([null, 0, 50, -50]);
  });
});

describe("export", () => {
  it("writes CSV with provenance lines and quoting", () => {
    const csv = toCsv(
      ["date", "px.close (USD)"],
      [
        ["2026-09-30", 1.5],
        ["a,b", null],
      ],
      ["demo"],
    );
    expect(csv).toBe('# source: demo\ndate,px.close (USD)\n2026-09-30,1.5\n"a,b",\n');
  });
  it("writes TSV for the clipboard", () => {
    expect(toTsv(["a", "b"], [[1, "x\ty"]])).toBe("a\tb\n1\tx y");
  });
});

describe("csv sources", () => {
  it("does not repeat the Source: prefix", () => {
    expect(toCsv(["a"], [], ["Source: demo · adjusted"])).toBe("# source: demo · adjusted\na\n");
  });
});
