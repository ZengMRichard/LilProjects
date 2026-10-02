import { describe, expect, it } from "vitest";
import cases from "../../../../packages/grammar-fixtures/cases.json";
import type { Instrument } from "../data/api";
import { CATALOG } from "../functions/catalog";
import { MANIFEST_BY_CODE, MANIFESTS } from "../functions/registry";
import { suggest } from "./autocomplete";
import { bindArgs, formatArgs, nearest } from "./bind";
import { parse } from "./parse";

const sym = (display: string, name: string, cls = "EQUITY"): Instrument =>
  ({
    id: `${cls}:US:${display.split(" ")[0]}`,
    asset_class: cls,
    symbol: display.split(" ")[0],
    display,
    name,
    currency: "USD",
    mic: "XNAS",
    country: "US",
    identifiers: {},
    provider_symbols: {},
  }) as Instrument;

const ctx = {
  codes: new Set(CATALOG.map((c) => c.code)),
  aliases: { functions: { PX: "CHRT" }, sectors: {}, securities: {} },
};
const src = {
  symbols: [
    sym("AAPL US EQUITY", "Apple Inc."),
    sym("AMZN US EQUITY", "Amazon.com, Inc."),
    sym("CHRW US EQUITY", "C.H. Robinson"),
    sym("SPX INDEX", "S&P 500 Index", "INDEX"),
  ],
  manifests: MANIFESTS,
  catalog: CATALOG,
  recent: ["AAPL US EQUITY CHRT 5Y"],
  ctx,
};

describe("bindArgs", () => {
  const chrt = MANIFEST_BY_CODE.get("CHRT")!;
  it("binds positionals in manifest order and fills defaults", () => {
    const r = bindArgs(chrt, ["5Y"], {});
    expect(r).toMatchObject({ ok: true, params: { period: "5Y", style: "line" } });
  });
  it("canonicalizes enum case", () => {
    const r = bindArgs(chrt, [], { style: "CANDLE" });
    expect(r.ok && r.params.style).toBe("candle");
  });
  it("rejects unknown arguments with suggestions", () => {
    const r = bindArgs(chrt, [], { perod: "5Y" });
    expect(r).toMatchObject({ ok: false, suggestions: ["period="] });
  });
  it("rejects bad enum values listing the valid ones", () => {
    const r = bindArgs(chrt, ["7Y"], {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.suggestions).toContain("5Y");
  });
  it("round-trips through formatArgs", () => {
    const r = bindArgs(chrt, ["5Y"], { vs: "MSFT US EQ, SPY US EQ" });
    expect(r.ok && formatArgs(chrt, r.params)).toBe('5Y vs="MSFT US EQ, SPY US EQ"');
  });
  it("nearest codes", () => {
    expect(nearest("CHRTT", ["CHRT", "HIST", "DESC"])).toEqual(["CHRT"]);
  });
});

describe("manifest examples", () => {
  for (const m of MANIFESTS) {
    for (const ex of m.examples ?? []) {
      it(`${m.code}: ${ex}`, () => {
        const p = parse(ex, ctx);
        expect(p.kind).toBe("invocation");
        if (p.kind !== "invocation") return;
        expect(p.code).toBe(m.code);
        expect(bindArgs(m, p.positional, p.named).ok).toBe(true);
      });
    }
  }
  it("every fixture invocation of a built function binds", () => {
    for (const c of cases) {
      const p = parse(c.input, ctx);
      if (p.kind !== "invocation" || !p.code) continue;
      const m = MANIFEST_BY_CODE.get(p.code);
      if (!m) continue;
      expect(bindArgs(m, p.positional, p.named).ok, c.input).toBe(true);
    }
  });
});

describe("autocomplete", () => {
  it("ranks the exact ticker first and ends with a search row", () => {
    const s = suggest("aapl", src);
    expect(s[0].label).toBe("AAPL US EQUITY");
    expect(s[s.length - 1].badge).toBe("SEARCH");
    expect(s.length).toBeLessThanOrEqual(8);
  });
  it("matches names by prefix", () => {
    expect(suggest("amaz", src)[0].label).toBe("AMZN US EQUITY");
  });
  it("offers function codes", () => {
    const s = suggest("CH", src);
    expect(s.map((x) => x.label)).toContain("CHRT");
  });
  it("after a sector word offers only codes valid for that class", () => {
    const s = suggest("SPX INDEX ", src).map((x) => x.label);
    expect(s).toContain("CHRT");
    expect(s).not.toContain("DESC");
    expect(s).not.toContain("WMON");
  });
  it("after a code offers its arguments", () => {
    const s = suggest("AAPL US EQUITY CHRT ", src).map((x) => x.label);
    expect(s).toContain("5Y");
    const named = suggest("CHRT st", src).map((x) => x.label);
    expect(named).toContain("style=candle");
  });
  it("shows recent commands on an empty line", () => {
    expect(suggest("", src)[0].label).toBe("AAPL US EQUITY CHRT 5Y");
  });
});
