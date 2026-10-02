import { describe, expect, it } from "vitest";
import cases from "../../../../packages/grammar-fixtures/cases.json";
import registry from "../../../../packages/grammar-fixtures/registry.json";
import { type GrammarContext, parse } from "./parse";

const ctx: GrammarContext = { codes: new Set(registry.codes), aliases: registry.aliases };

describe("grammar fixtures (shared with the Python suite)", () => {
  for (const c of cases) {
    it(JSON.stringify(c.input), () => {
      expect(parse(c.input, ctx)).toEqual(c.expect);
    });
  }
});
