import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PAGINA_VIDEOS, duurTekst, paginaVideo } from "@/lib/marketing/paginavideos";

// De korte uitlegvideo's op de openbare pagina's (16 nov): elk bestand bestaat en staat met zijn bronnen in CREDITS.md, de tekst
// die wordt voorgelezen staat er ook als tekst bij, en een video belooft niets wat niet bestaat.

const root = process.cwd();
const credits = readFileSync(path.join(root, "public/videos/pagina/CREDITS.md"), "utf8");

describe("paginavideo's", () => {
  it("elke video heeft een mp4 en een poster en staat in CREDITS.md", () => {
    for (const v of Object.values(PAGINA_VIDEOS)) {
      expect(existsSync(path.join(root, "public/videos/pagina", `${v.slug}.mp4`)), `${v.slug}.mp4`).toBe(true);
      expect(existsSync(path.join(root, "public/videos/pagina", `${v.slug}.jpg`)), `${v.slug}.jpg`).toBe(true);
      expect(credits, v.slug).toContain(`\`${v.slug}.mp4\``);
      expect(v.seconden).toBeGreaterThan(10);
      expect(v.seconden).toBeLessThan(120);
      expect(v.tekst.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("de tekst bij de video noemt geen prijs anders dan de platformkosten, en geen aantallen of beloftes over klanten", () => {
    const alles = Object.values(PAGINA_VIDEOS).flatMap((v) => v.tekst).join(" ");
    expect(alles).not.toMatch(/€\s?\d/);
    expect(alles).not.toMatch(/\d+\s*(klanten|bedrijven|rijscholen)/i);
    expect(alles).not.toMatch(/binnenkort|komt eraan/i);
  });

  it("elke pagina die een video wil tonen, kent hem", () => {
    // de voorpagina toont sinds 21 nov geen uitlegvideo meer (eigenaar: "haal de uitlegvideo's weg")
    const paginas: [string, string][] = [
      // 21 nov 2026: voor-bedrijven, prijzen en horeca tonen hun video niet meer op de pagina, maar in de videokamer /uitleg/videos
      ["app/(marketing)/uitzendbureau/page.tsx", "uitzendbureau"],
      ["app/(marketing)/rijschool-software/page.tsx", "rijschool-software"],
      // /website-maken toont zijn video niet meer (19 nov 2026): de pagina is een aanvraag geworden, de video legt nog het zelf bouwen uit
    ];
    for (const [bestand, id] of paginas) {
      expect(readFileSync(path.join(root, bestand), "utf8"), bestand).toContain(`<PaginaVideoBlok id="${id}" />`);
      expect(paginaVideo(id), id).toBeDefined();
    }
  });

  it("een rare sleutel geeft niets terug en de duur staat in gewone woorden", () => {
    expect(paginaVideo("constructor")).toBeUndefined();
    expect(paginaVideo("bestaat-niet")).toBeUndefined();
    expect(duurTekst(35)).toBe("35 seconden");
    expect(duurTekst(120)).toBe("2 minuten");
  });
});
