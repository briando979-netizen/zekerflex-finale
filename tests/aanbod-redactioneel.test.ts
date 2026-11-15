import { describe, expect, it } from "vitest";
import { AANBOD } from "@/lib/marketing/aanbod";
import { NUMBER_TYPES } from "@/lib/telephony/plans";
import { REDACTIONEEL, redactioneelVan } from "@/lib/marketing/aanbod-redactioneel";

// De redactionele aanbodpagina (15 nov): wat erop staat moet bestaan, en er staan geen prijzen of verzonnen cijfers op.

describe("redactionele aanbodpagina's", () => {
  it("horen bij een aanbodonderdeel met een eigen pagina, en de links bestaan", () => {
    for (const [slug, r] of Object.entries(REDACTIONEEL)) {
      const a = AANBOD.find((x) => x.slug === slug);
      expect(a, slug).toBeDefined();
      expect(a?.pagina).toBeUndefined();
      for (const i of r.rest.items) expect(AANBOD.some((x) => x.slug === i.slug), `${slug} → ${i.slug}`).toBe(true);
    }
  });

  it("noemt geen prijs, aantal klanten of beoordeling", () => {
    const tekst = JSON.stringify(REDACTIONEEL);
    expect(tekst).not.toMatch(/€\s?\d/);
    expect(tekst).not.toMatch(/\d+\s*(klanten|bedrijven)/i);
    expect(tekst).not.toMatch(/beoordeling|sterren|reviews?\b.*\d/i);
  });

  it("telefonie belooft alleen wat de catalogus kent: de nummersoorten die direct kunnen en die op aanvraag zijn", () => {
    const t = REDACTIONEEL["telefonie"]!;
    const direct = NUMBER_TYPES.filter((n) => n.availability === "direct").map((n) => n.id);
    expect(direct.sort()).toEqual(["eigen", "mobiel097"]);
    expect(t.verschil.tekst).toContain("097");
    for (const soort of ["06", "085", "088", "0800"]) expect(t.verschil.tekst).toContain(soort);
    // bellen in de app of op de computer kan nog niet: dat staat er eerlijk bij
    expect(t.vragen.items.some((v) => /Nog niet/.test(v.antwoord))).toBe(true);
  });

  it("een rare sleutel geeft niets terug", () => {
    expect(redactioneelVan("telefonie")).toBeDefined();
    expect(redactioneelVan("constructor")).toBeUndefined();
  });
});
