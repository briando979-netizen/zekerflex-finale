import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AANBOD } from "@/lib/marketing/aanbod";

// Echte schermen van het product op /aanbod/<slug> ("inkijk", 15 nov 2026): het bestand bestaat, de maten kloppen met
// width/height van next/image (anders verspringt de pagina), en de herkomst staat in CREDITS.md.
const MAP = join(process.cwd(), "public", "aanbod", "inkijk");
const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const schermen = AANBOD.flatMap((a) => (a.inkijk ?? []).map((s) => ({ slug: a.slug, ...s })));

describe("inkijk: echte schermen op de aanbodpagina's", () => {
  it("horeca heeft schermen, en elk scherm is volledig ingevuld", () => {
    expect(schermen.filter((s) => s.slug === "horeca").length).toBeGreaterThanOrEqual(4);
    for (const s of schermen) {
      expect(s.titel.length, s.bestand).toBeGreaterThan(3);
      expect(s.tekst.length, s.bestand).toBeLessThanOrEqual(140);
      expect(s.alt.length, s.bestand).toBeGreaterThan(15);
      expect(s.bestand, s.bestand).toMatch(/^[a-z0-9-]+\.webp$/);
    }
    // geen dubbele bestanden
    expect(new Set(schermen.map((s) => s.bestand)).size).toBe(schermen.length);
  });

  it("elk bestand bestaat, met de maten die de pagina opgeeft", async () => {
    for (const s of schermen) {
      const pad = join(MAP, s.bestand);
      expect(existsSync(pad), s.bestand).toBe(true);
      const m = await sharp(pad).metadata();
      expect([m.width, m.height], s.bestand).toEqual([s.breedte, s.hoogte]);
    }
  });

  it("de map bevat alleen schermen die gebruikt worden, en elk staat in CREDITS.md", () => {
    const gebruikt = new Set(schermen.map((s) => s.bestand));
    for (const f of readdirSync(MAP)) expect(gebruikt.has(f), `${f} wordt nergens gebruikt`).toBe(true);
    const credits = lees("public/aanbod/CREDITS.md");
    for (const s of schermen) expect(credits, s.bestand).toContain(`inkijk/${s.bestand}`);
  });

  it("de standaardopmaak toont ze in een eigen blok, en de kop gebruikt het eerste scherm als er geen foto is", () => {
    const opmaak = lees("components/marketing/aanbod/AanbodStandaard.tsx");
    expect(opmaak).toContain('aria-labelledby="aanbod-inkijk"');
    expect(opmaak).toContain('a.inkijk?.find((x) => x.toestel !== "telefoon")');
    expect(opmaak).toContain("<figcaption>");
  });
});
