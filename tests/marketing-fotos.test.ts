import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FOTOS, FOTOTHEMA_NAAM, fotoPad, fotosVan, type FotoThema } from "@/lib/marketing/fotos";

const MAP = join(process.cwd(), "public", "marketing", "foto");
const credits = readFileSync(join(MAP, "CREDITS.md"), "utf8");

describe("fotobibliotheek voor marketing", () => {
  it("heeft geen dubbele bestandsnamen of Pexels-nummers", () => {
    expect(new Set(FOTOS.map((f) => f.slug)).size).toBe(FOTOS.length);
    expect(new Set(FOTOS.map((f) => f.pexels)).size).toBe(FOTOS.length);
  });

  it("elke foto bestaat, is een JPEG, past op Instagram (4:5 tot 1,91:1) en staat met bron in CREDITS.md", async () => {
    for (const f of FOTOS) {
      const bestand = join(process.cwd(), "public", fotoPad(f));
      expect(existsSync(bestand), f.slug).toBe(true);
      const buf = readFileSync(bestand);
      expect([...buf.subarray(0, 3)], `${f.slug} is geen JPEG`).toEqual([0xff, 0xd8, 0xff]);
      const m = await sharp(buf).metadata();
      const verhouding = (m.width ?? 1) / (m.height ?? 1);
      expect(verhouding, f.slug).toBeGreaterThanOrEqual(0.8);
      expect(verhouding, f.slug).toBeLessThanOrEqual(1.91);
      if (f.staand) expect(verhouding, f.slug).toBeCloseTo(0.8, 2);
      expect(credits, `${f.slug} ontbreekt in CREDITS.md`).toContain(`\`${f.slug}.jpg\``);
      expect(credits, `${f.slug}: nummer ontbreekt in CREDITS.md`).toContain(`Pexels #${f.pexels}`);
    }
  });

  it("elke foto heeft een omschrijving in gewoon Nederlands en minstens één trefwoord", () => {
    for (const f of FOTOS) {
      expect(f.alt.length, f.slug).toBeGreaterThan(15);
      expect(f.trefwoorden.length, f.slug).toBeGreaterThan(0);
    }
  });

  it("elk thema heeft foto's en een naam; en er liggen geen foto's in de map die niet in de lijst staan", () => {
    for (const t of Object.keys(FOTOTHEMA_NAAM) as FotoThema[]) expect(fotosVan(t).length, t).toBeGreaterThan(0);
    const inCredits = [...credits.matchAll(/`([a-z0-9-]+)\.jpg`/g)].map((m) => m[1]);
    expect(inCredits.sort()).toEqual(FOTOS.map((f) => f.slug).sort());
  });
});
