import { describe, expect, it } from "vitest";
import { specFor } from "@/lib/shop/product-specs";

// De omschrijving van een product zonder eigen specificaties wordt zin voor
// zin een opsomming. Zonder lookbehind in de regex (Safari vóór 16.4).

describe("specFor", () => {
  it("splitst een omschrijving op zinnen en op het middelpunt", () => {
    const { bullets } = specFor("onbekend-product", "Zachte sweatstof. Ruime pasvorm · Wasbaar op 40 graden.  Gemaakt in Portugal");
    expect(bullets).toEqual(["Zachte sweatstof", "Ruime pasvorm", "Wasbaar op 40 graden", "Gemaakt in Portugal"]);
  });

  it("laat een punt binnen een zin staan en slaat lege stukken over", () => {
    expect(specFor("x", "Maat 42.5 past · ").bullets).toEqual(["Maat 42.5 past"]);
    expect(specFor("x", "").bullets).toEqual([]);
  });
});
