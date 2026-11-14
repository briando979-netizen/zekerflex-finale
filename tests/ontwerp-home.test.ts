import { describe, expect, it } from "vitest";
import { HOME_SECTIES, MAX_EIGEN_BLOKKEN, eigenSleutel, isSectie, isStandaardHomeIndeling, normalizeHomeIndeling, standaardHomeIndeling, zichtbareSecties } from "@/lib/ontwerp/home";
import { leegBlok } from "@/lib/ontwerp/paginas";

const ALLE = HOME_SECTIES.map((s) => s.id);

describe("homepage-indeling uit de Site-ontwerper", () => {
  it("zonder eigen indeling precies de standaardvolgorde", () => {
    expect(zichtbareSecties(null)).toEqual(ALLE);
    expect(zichtbareSecties(undefined)).toEqual(ALLE);
    expect(zichtbareSecties(standaardHomeIndeling())).toEqual(ALLE);
    expect(isStandaardHomeIndeling(standaardHomeIndeling())).toBe(true);
    // de volgorde van vóór de ontwerper, met sinds 11 nov de voordeur "Wat wil je doen?" vooraan, en sinds 14 nov
    // zonder de blokken voor werkers (freelancers, werkvormen, app): /bedrijven is alleen voor bedrijven
    expect(ALLE).toEqual(["voordeur", "vertrouwen", "aanbod", "branches", "hoe", "bedrijven", "cijfers", "functies", "zekerheid", "citaat", "vragen", "oproep"]);
  });

  it("verbergt en verplaatst", () => {
    const i = { volgorde: ["vragen", "vertrouwen", ...ALLE.filter((x) => x !== "vragen" && x !== "vertrouwen")], verborgen: ["citaat", "functies"] };
    const z = zichtbareSecties(normalizeHomeIndeling(i));
    expect(z.slice(0, 2)).toEqual(["vragen", "vertrouwen"]);
    expect(z).not.toContain("citaat");
    expect(z).not.toContain("functies");
    expect(z.length).toBe(ALLE.length - 2);
    expect(isStandaardHomeIndeling(normalizeHomeIndeling(i))).toBe(false);
  });

  it("onbekende en dubbele blokken vallen weg, ontbrekende komen achteraan", () => {
    const n = normalizeHomeIndeling({ volgorde: ["oproep", "onbekend", "oproep", 7], verborgen: ["onbekend", "faq", "vragen"] });
    // de voordeur staat ook bij een eigen volgorde vooraan; daarna volgt wat de eigenaar koos
    expect(n.volgorde[0]).toBe("voordeur");
    expect(n.volgorde[1]).toBe("oproep");
    expect(n.volgorde.length).toBe(ALLE.length);
    expect(new Set(n.volgorde).size).toBe(ALLE.length);
    expect(n.verborgen).toEqual(["vragen"]);
    expect(normalizeHomeIndeling(null)).toEqual(standaardHomeIndeling());
    expect(normalizeHomeIndeling("onzin")).toEqual(standaardHomeIndeling());
  });

  it("eigen blokken: op hun plek, gecontroleerd zoals op eigen pagina's, zonder plek achteraan", () => {
    const tekst = { ...leegBlok("tekst"), kop: "Nieuw: horecasoftware", tekst: "Alles in één." };
    const oproep = { ...leegBlok("oproep"), kop: "Bel ons", knop: { tekst: "Kwaad", link: "javascript:alert(1)" } };
    const n = normalizeHomeIndeling({
      volgorde: ["vertrouwen", `blok:${tekst.id}`, "blok:bestaatniet", ...ALLE.filter((x) => x !== "vertrouwen")],
      verborgen: [],
      eigen: [tekst, oproep, { soort: "onbekend" }],
    });
    expect(n.eigen.map((b) => b.id)).toEqual([tekst.id, oproep.id]);
    expect(n.volgorde.slice(0, 2)).toEqual(["vertrouwen", eigenSleutel(tekst)]);
    expect(n.volgorde.at(-1)).toBe(eigenSleutel(oproep));
    expect(n.volgorde).not.toContain("blok:bestaatniet");
    const o = n.eigen.find((b) => b.id === oproep.id);
    expect(o?.soort === "oproep" ? o.knop.link : "?").toBe("");
    const z = zichtbareSecties(n);
    expect(z[1]).toBe(eigenSleutel(tekst));
    expect(z.filter((id) => !isSectie(id)).length).toBe(2);
    expect(isStandaardHomeIndeling(n)).toBe(false);
    // dubbel normaliseren verandert niets (de id's blijven gelijk)
    expect(normalizeHomeIndeling(JSON.parse(JSON.stringify(n)))).toEqual(n);
  });

  it("een bewaarde indeling met de oude blokken voor werkers: die vallen weg, de rest blijft staan", () => {
    const n = normalizeHomeIndeling({ volgorde: ["freelancers", "oproep", "werkvormen", "app"], verborgen: ["app", "citaat"], eigen: [] });
    expect(n.volgorde).not.toContain("freelancers");
    expect(n.volgorde).not.toContain("werkvormen");
    expect(n.volgorde).not.toContain("app");
    expect(n.volgorde.slice(0, 2)).toEqual(["voordeur", "oproep"]);
    expect(n.verborgen).toEqual(["citaat"]);
  });

  it("hooguit 12 eigen blokken", () => {
    const veel = Array.from({ length: 20 }, () => leegBlok("ruimte"));
    expect(normalizeHomeIndeling({ eigen: veel }).eigen.length).toBe(MAX_EIGEN_BLOKKEN);
  });
});
