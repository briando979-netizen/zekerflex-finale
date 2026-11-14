import { describe, expect, it } from "vitest";
import { CITIES, cityBySlug } from "@/lib/seo-cities";

// De stadspagina's (freelance-werk, personeel-inhuren en 5 sectoren × 2) komen uit deze lijst; elke stad draagt
// één eigen, ware regel lokale tekst. De regio van de eigen vestiging (Zuidbroek, Midden-Groningen) hoort erin.

const REGIO = ["veendam", "hoogezand", "winschoten", "stadskanaal", "assen"];

describe("seo-cities: de lijst waar de stadspagina's uit komen", () => {
  it("heeft unieke slugs en namen, en coördinaten binnen Nederland", () => {
    const slugs = CITIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(CITIES.map((c) => c.name)).size).toBe(CITIES.length);
    for (const c of CITIES) {
      expect(c.slug).toMatch(/^[a-z-]+$/);
      expect(c.lat).toBeGreaterThan(50.7);
      expect(c.lat).toBeLessThan(53.6);
      expect(c.lng).toBeGreaterThan(3.3);
      expect(c.lng).toBeLessThan(7.3);
      expect(c.sectors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("geeft elke stad een eigen lokale regel, geen dunne kopie en geen cijfers", () => {
    const regels = CITIES.map((c) => c.local);
    expect(new Set(regels).size).toBe(regels.length);
    for (const c of CITIES) expect(c.local.length).toBeGreaterThanOrEqual(60);
    // de regiosteden van 14 nov: de plaats staat in de tekst en er staan geen verzonnen aantallen in
    // (oudere teksten noemen de stad soms niet, of een echte naam met een cijfer)
    for (const slug of REGIO) {
      const c = cityBySlug(slug)!;
      expect(c.local).toContain(c.name.split("-")[0]!);
      expect(c.local, slug).not.toMatch(/\d/);
    }
  });

  it("kent de regio van de eigen vestiging: Veendam, Hoogezand-Sappemeer, Winschoten, Stadskanaal en Assen", () => {
    for (const slug of ["groningen", ...REGIO]) {
      expect(cityBySlug(slug), slug).toBeDefined();
    }
    expect(cityBySlug("hoogezand")?.local).toMatch(/Zuidbroek/);
    expect(cityBySlug("assen")?.province).toBe("Drenthe");
    // Veendam en Hoogezand liggen elk binnen 25 km van Zuidbroek (53.16, 6.86), zodat klussen daar op beide pagina's staan
    const afstand = (a: { lat: number; lng: number }) => Math.hypot((a.lat - 53.16) * 111, (a.lng - 6.86) * 66.5);
    expect(afstand(cityBySlug("veendam")!)).toBeLessThan(25);
    expect(afstand(cityBySlug("hoogezand")!)).toBeLessThan(25);
  });
});
