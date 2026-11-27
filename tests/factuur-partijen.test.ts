import { describe, expect, it } from "vitest";
import { partijRegels, straatMetNummer } from "@/lib/billing/factuur-partijen";

// Afzender en ontvanger op de factuur-pdf (art. 35a Wet OB): naam en adres van beide partijen, KVK en btw-id. Alleen
// wat bekend is komt erop, zonder lege regels.
describe("partijRegels", () => {
  it("adres, KVK en btw-id onder de naam", () => {
    expect(
      partijRegels({ naam: "Bakkerij De Korst", straat: "Hoofdstraat 12a", postcode: "9641 NG", plaats: "Veendam", land: "NL", kvk: "12345678", btw: "nl 0012.34567 b01" }),
    ).toEqual(["Hoofdstraat 12a", "9641 NG Veendam", "KVK 12345678", "Btw-id NL0012.34567B01"]);
  });

  it("laat weg wat ontbreekt, zonder lege regels", () => {
    expect(partijRegels({ naam: "Jan" })).toEqual([]);
    expect(partijRegels({ naam: "Jan", postcode: "9641 NG", straat: "  ", kvk: "" })).toEqual(["9641 NG"]);
  });

  it("noemt het land alleen buiten Nederland", () => {
    expect(partijRegels({ naam: "X", postcode: "10115", plaats: "Berlin", land: "de" })).toEqual(["10115 Berlin (DE)"]);
    expect(partijRegels({ naam: "X", land: "BE" })).toEqual(["BE"]);
  });

  it("straat en huisnummer uit het Handelsregister samen", () => {
    expect(straatMetNummer("Hoofdstraat", "12a")).toBe("Hoofdstraat 12a");
    expect(straatMetNummer("Hoofdstraat", null)).toBe("Hoofdstraat");
    expect(straatMetNummer(null, null)).toBeUndefined();
  });
});
