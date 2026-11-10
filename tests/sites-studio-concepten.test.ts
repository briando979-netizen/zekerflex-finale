import { describe, expect, it } from "vitest";
import { winkelDeelSchema, winkelSchema } from "@/lib/sites/schema";
import {
  datumTekst,
  kortingNaarConcept,
  kortingSamenvatting,
  leesKortingConcepten,
  leesVerzendConcepten,
  nieuwKortingConcept,
  nieuwVerzendConcept,
  verzendNaarConcept,
  verzendSamenvatting,
  willekeurigeCode,
} from "@/lib/sites/studio-concepten";
import { LEGE_WINKEL } from "@/lib/sites/types";
import { leveringVan, verzendmethodenVan } from "@/lib/sites/winkel-verzending";

// Webshop → Kortingen en Verzending: wat de winkelier typt wordt een kortingscode of
// verzendmethode die de server accepteert, met een Nederlandse foutzin per veld.

describe("studio: kortingscodes uit het formulier", () => {
  it("maakt van een ingevuld formulier een geldige code die het schema accepteert", () => {
    const c = { ...nieuwKortingConcept("knieuw001"), code: "zomer10", waarde: "15", minimum: "25,00", totEnMet: "2026-12-31", max: "100" };
    const r = leesKortingConcepten([c]);
    expect(r.fouten).toEqual({});
    expect(r.codes).toEqual([{ id: "knieuw001", code: "ZOMER10", soort: "procent", waarde: 15, minimumCents: 2500, totEnMet: "2026-12-31", maxGebruik: 100, actief: true }]);
    expect(winkelSchema.safeParse({ ...LEGE_WINKEL, kortingscodes: r.codes }).success).toBe(true);
    expect(kortingNaarConcept(r.codes[0]!)).toMatchObject({ code: "ZOMER10", waarde: "15", minimum: "25,00", max: "100" });
    expect(kortingSamenvatting(c)).toBe("15% korting vanaf € 25,00 · t/m 31 december 2026 · hoogstens 100 keer");
  });

  it("geeft per veld een foutzin, ook voor een code die al bestaat", () => {
    const r = leesKortingConcepten([
      { ...nieuwKortingConcept("kaaaa0001"), code: "WELKOM" },
      { ...nieuwKortingConcept("kbbbb0002"), code: "welkom", waarde: "150" },
      { ...nieuwKortingConcept("kcccc0003"), code: "X", soort: "bedrag", waarde: "", minimum: "veel", max: "0" },
    ]);
    expect(r.codes.map((k) => k.code)).toEqual(["WELKOM"]);
    expect(r.fouten.kbbbb0002).toEqual({ code: "Deze code bestaat al.", waarde: "Vul een percentage in van 1 tot 100, zonder komma." });
    expect(Object.keys(r.fouten.kcccc0003 ?? {})).toEqual(["code", "waarde", "minimum", "max"]);
  });

  it("bedenkt codes van acht tekens zonder letters die op elkaar lijken", () => {
    const code = willekeurigeCode(() => 0.5);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(datumTekst("2027-01-05")).toBe("5 januari 2027");
  });
});

describe("studio: verzendmethoden uit het formulier", () => {
  it("begint een oude winkel met zijn afhalen en bezorgen, en bewaart ze met levering erbij", () => {
    const oud = { ...LEGE_WINKEL, levering: { afhalen: true, bezorgen: true, bezorgkostenCents: 395, gratisVanafCents: 2500 } };
    const concepten = verzendmethodenVan(oud).map(verzendNaarConcept);
    expect(concepten.map((c) => [c.naam, c.prijs, c.gratisVanaf])).toEqual([
      ["Afhalen", "", ""],
      ["Bezorgen", "3,95", "25,00"],
    ]);
    const r = leesVerzendConcepten(concepten);
    expect(r.fouten).toEqual({});
    expect(leveringVan(r.methoden)).toEqual(oud.levering);
    expect(winkelSchema.safeParse({ ...oud, verzendmethoden: r.methoden }).success).toBe(true);
  });

  it("zet afhalen voorop, maakt een lege prijs gratis en vraagt om een naam", () => {
    const bezorg = { ...nieuwVerzendConcept("vpost0001", "bezorgen"), naam: "PostNL", prijs: "4,95", gratisVanaf: "50", gebied: "eu" as const, levertijd: "1 tot 2 werkdagen" };
    const afhaal = { ...nieuwVerzendConcept("vwink0001", "afhalen"), adres: "Markt 3, Zonnedorp" };
    const r = leesVerzendConcepten([bezorg, afhaal, { ...nieuwVerzendConcept("vleeg0001", "bezorgen"), prijs: "abc" }]);
    expect(r.methoden.map((m) => [m.id, m.prijsCents, m.gratisVanafCents])).toEqual([
      ["vwink0001", 0, null],
      ["vpost0001", 495, 5000],
    ]);
    expect(Object.keys(r.fouten.vleeg0001 ?? {})).toEqual(["naam", "prijs"]);
    expect(verzendSamenvatting(bezorg, "")).toBe("€ 4,95, gratis vanaf € 50,00 · In de hele EU · 1 tot 2 werkdagen");
    expect(verzendSamenvatting({ ...afhaal, adres: "" }, "Molenweg 4, 1234 AB Zonnedorp")).toBe("Gratis · Molenweg 4, 1234 AB Zonnedorp");
  });
});

describe("studio: een deel van de winkel opslaan", () => {
  it("accepteert alleen instellingen, nooit de producten, en null om btw of betalen weg te halen", () => {
    expect(winkelDeelSchema.safeParse({ btw: null, betalen: null }).success).toBe(true);
    expect(winkelDeelSchema.safeParse({ producten: [] }).success).toBe(false);
    expect(winkelDeelSchema.safeParse({ kortingscodes: [], bestellen: false }).success).toBe(true);
    expect(winkelDeelSchema.safeParse({ iets: 1 }).success).toBe(false);
  });
});
