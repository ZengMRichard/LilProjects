import type { Instrument } from "../data/api";

/**
 * Default function by asset class when a security is typed without one: EQUITY opens DESC;
 * INDEX, CURNCY, CRYPTO, CMDTY and single GOVT yields open CHRT; a country curve opens CURV;
 * ECON opens ECON.
 */
export function defaultCode(inst: Pick<Instrument, "asset_class">): string {
  switch (inst.asset_class) {
    case "EQUITY":
      return "DESC";
    case "CURVE":
      return "CURV";
    case "ECON":
      return "ECON";
    default:
      return "CHRT";
  }
}
