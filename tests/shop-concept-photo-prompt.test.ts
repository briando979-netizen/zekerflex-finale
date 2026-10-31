import { describe, expect, it } from "vitest";
import { buildConceptPrompt } from "@/lib/shop/concept-photos";

// De prompt-bouwer is puur (geen DB/beeld-server), dus goed los te testen: de
// geslacht-/collectie-afleiding en dat er nooit "undefined"/"null" in de prompt
// lekt bij lege velden.
describe("buildConceptPrompt", () => {
  const base = { name: "Gebreide Winter Trui", description: "Warme gebreide trui.", category: "Kleding" };

  it("zet het geslacht om naar Engels en voegt de collectie-hint toe", () => {
    const p = buildConceptPrompt({ ...base, gender: "heren", collection: "Winter 2026" });
    expect(p).toContain("men's Gebreide Winter Trui");
    expect(p).toContain("warm winter workwear");
    expect(p).toContain("no people");
  });

  it("valt terug op de collectienaam zelf als er geen hint is", () => {
    const p = buildConceptPrompt({ ...base, gender: "vrouwen", collection: "Lente 2027" });
    expect(p).toContain("women's");
    expect(p).toContain("Lente 2027");
  });

  it("lekt geen undefined/null bij lege velden", () => {
    const p = buildConceptPrompt({ ...base, gender: null, collection: null });
    expect(p).not.toMatch(/undefined|null/);
    // geen dubbele spaties door een leeg geslacht-woord
    expect(p).not.toMatch(/ {2,}/);
    expect(p.toLowerCase()).toContain("gebreide winter trui");
  });
});
