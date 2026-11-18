import { describe, expect, it } from "vitest";
import { herkomstVan, levertijdBereik, levertijdDagen, levertijdVoorLeverancier } from "@/lib/shop/levertijd";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

// Levertijd eerlijk (18 nov 2026): een product van de leverancier (CJ, magazijn DE of CN) belooft geen "morgen in huis"
// meer, en de servicebalk belooft niets wat niet voor de hele winkel geldt.

describe("herkomst van een product", () => {
  it("verkoper gaat voor; een cj-sku maakt het een leveranciersproduct; anders eigen voorraad", () => {
    expect(herkomstVan({ seller: "Bakkerij Jansen", variants: [{ sku: "cj-x" }] })).toBe("verkoper");
    expect(herkomstVan({ seller: null, variants: [{ sku: "wg-1" }, { sku: "cj-abc-xl" }] })).toBe("leverancier");
    expect(herkomstVan({ seller: null, variants: [{ sku: "wg-1" }] })).toBe("eigen");
    expect(herkomstVan({})).toBe("eigen");
  });
});

describe("levertijd in dagen", () => {
  it.each([
    ["6-12", "DE", [6, 12]],
    ["6~12", "CN", [6, 12]],
    ["6 - 12 days", "DE", [6, 12]],
    ["12-6", "DE", [6, 12]],
    ["10", "DE", [10, 10]],
    ["", "DE", [3, 7]],
    [null, "CN", [7, 15]],
    [undefined, "", [7, 15]],
    ["0-99", "DE", [3, 7]],
    ["onzin", "de", [3, 7]],
  ])("%s / %s → %j", (aging, magazijn, verwacht) => {
    expect(levertijdDagen(aging as string | null | undefined, magazijn)).toEqual(verwacht);
  });

  it("schrijft het bereik voor in een zin", () => {
    expect(levertijdBereik([6, 12])).toBe("6-12");
    expect(levertijdBereik([7, 7])).toBe("7");
    expect(levertijdVoorLeverancier("6-12", "DE")).toBe("6-12");
    expect(levertijdVoorLeverancier(null, "DE")).toBe("3-7");
  });
});

describe("de beloftes van de winkel kloppen voor de hele winkel", () => {
  it("geen 'volgende werkdag in huis' en geen '30 dagen retour' meer in de servicebalk en de aankondiging", () => {
    for (const d of [nl, en]) {
      for (const tekst of [d.shop.uspNextDay, d.shop.announcement, d.shop.uspReturns]) {
        expect(tekst).not.toMatch(/volgende werkdag|next working day|next business day|morgen in huis|30 dagen|30-day/i);
      }
      expect(d.shop.uspReturns).toMatch(/14/);
    }
    // en de leverancierstermijn heeft een plek in de teksten
    expect(nl.shop.opVoorraadLevertijd).toContain("{dagen}");
    expect(nl.shop.lowStockLevertijd).toContain("{dagen}");
    expect(nl.shop.bezorgLeverancier).toContain("{dagen}");
    expect(en.shop.uspLevertijd).toContain("{dagen}");
  });
});
