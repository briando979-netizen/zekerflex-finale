import { describe, expect, it } from "vitest";
import { HOME_SECTIES, isStandaardHomeIndeling, normalizeHomeIndeling, standaardHomeIndeling, zichtbareSecties } from "@/lib/ontwerp/home";

const ALLE = HOME_SECTIES.map((s) => s.id);

describe("homepage-indeling uit de Site-ontwerper", () => {
  it("zonder eigen indeling precies de standaardvolgorde", () => {
    expect(zichtbareSecties(null)).toEqual(ALLE);
    expect(zichtbareSecties(undefined)).toEqual(ALLE);
    expect(zichtbareSecties(standaardHomeIndeling())).toEqual(ALLE);
    expect(isStandaardHomeIndeling(standaardHomeIndeling())).toBe(true);
    // dezelfde volgorde als op de pagina vóór de ontwerper
    expect(ALLE).toEqual(["vertrouwen", "aanbod", "branches", "hoe", "freelancers", "bedrijven", "werkvormen", "cijfers", "functies", "zekerheid", "citaat", "vragen", "app", "oproep"]);
  });

  it("verbergt en verplaatst", () => {
    const i = { volgorde: ["vragen", "vertrouwen", ...ALLE.filter((x) => x !== "vragen" && x !== "vertrouwen")], verborgen: ["citaat", "app"] };
    const z = zichtbareSecties(normalizeHomeIndeling(i));
    expect(z.slice(0, 2)).toEqual(["vragen", "vertrouwen"]);
    expect(z).not.toContain("citaat");
    expect(z).not.toContain("app");
    expect(z.length).toBe(ALLE.length - 2);
    expect(isStandaardHomeIndeling(normalizeHomeIndeling(i))).toBe(false);
  });

  it("onbekende en dubbele blokken vallen weg, ontbrekende komen achteraan", () => {
    const n = normalizeHomeIndeling({ volgorde: ["oproep", "onbekend", "oproep", 7], verborgen: ["onbekend", "faq", "vragen"] });
    expect(n.volgorde[0]).toBe("oproep");
    expect(n.volgorde.length).toBe(ALLE.length);
    expect(new Set(n.volgorde).size).toBe(ALLE.length);
    expect(n.verborgen).toEqual(["vragen"]);
    expect(normalizeHomeIndeling(null)).toEqual(standaardHomeIndeling());
    expect(normalizeHomeIndeling("onzin")).toEqual(standaardHomeIndeling());
  });
});
