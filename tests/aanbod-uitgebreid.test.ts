import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AANBOD } from "@/lib/marketing/aanbod";
import { UITGEBREID, uitgebreidVan } from "@/lib/marketing/aanbod-uitgebreid";

// De uitgebreide aanbodpagina (15 nov): alles waar hij naar verwijst moet bestaan, en er staan geen verzonnen cijfers in.

describe("uitgebreide aanbodpagina's", () => {
  it("horen bij een bestaand aanbodonderdeel met een eigen pagina", () => {
    for (const slug of Object.keys(UITGEBREID)) {
      const a = AANBOD.find((x) => x.slug === slug);
      expect(a, slug).toBeDefined();
      expect(a?.pagina, `${slug} heeft elders een eigen pagina`).toBeUndefined();
    }
  });

  it("de kaarten onderaan en de foto bestaan", () => {
    for (const [slug, u] of Object.entries(UITGEBREID)) {
      for (const s of u.andere) expect(AANBOD.some((x) => x.slug === s), `${slug} → ${s}`).toBe(true);
      expect(new Set(u.andere).size).toBe(3);
      expect(existsSync(path.join(process.cwd(), "public", "aanbod", u.foto.bestand)), u.foto.bestand).toBe(true);
      for (const beeld of Object.values(u.beelden)) {
        expect(existsSync(path.join(process.cwd(), "public", "aanbod", beeld.bestand)), beeld.bestand).toBe(true);
        expect(beeld.alt.length).toBeGreaterThan(10);
      }
    }
  });

  it("noemt geen prijs, aantal klanten of beoordeling", () => {
    const tekst = JSON.stringify(UITGEBREID);
    expect(tekst).not.toMatch(/€\s?\d/);
    expect(tekst).not.toMatch(/\d+\s*(klanten|bedrijven|rijscholen)/i);
    expect(tekst).not.toMatch(/beoordeling|sterren|reviews/i);
  });

  it("een onbekende of rare sleutel geeft niets terug", () => {
    expect(uitgebreidVan("automatisch-inchecken")).toBeDefined();
    expect(uitgebreidVan("constructor")).toBeUndefined();
    expect(uitgebreidVan("bestaat-niet")).toBeUndefined();
  });
});
