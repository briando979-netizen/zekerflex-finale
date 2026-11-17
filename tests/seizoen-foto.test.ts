import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THEMES } from "@/lib/seasons/calendar";
import { SEIZOEN_FOTOS, seizoenFoto } from "@/lib/seasons/foto";

// Seizoensfoto's in de feestlaag (17 nov 2026): elk feest heeft een licht beeld in public/seizoen,
// de werker-app krijgt waar die bestaat een eigen versie, en de kaart blijft pure versiering.

const ROOT = join(__dirname, "..");
const MAP = join(ROOT, "public", "seizoen");

describe("seizoensfoto's", () => {
  it("elk feest (behalve een verjaardag) heeft een beeld dat echt bestaat en licht is", () => {
    for (const t of THEMES) {
      const f = seizoenFoto(t.id, "/");
      if (t.id === "verjaardag") {
        expect(f).toBeNull();
        continue;
      }
      expect(f, t.id).not.toBeNull();
      expect(f!.src).toMatch(/^\/seizoen\/[a-z-]+\.jpg$/);
      expect(f!.alt.length).toBeGreaterThan(8);
      const pad = join(ROOT, "public", f!.src);
      expect(existsSync(pad), pad).toBe(true);
      expect(statSync(pad).size).toBeLessThan(120 * 1024);
    }
  });

  it("de werker-app krijgt de werkersversie, de rest het gewone beeld", () => {
    expect(seizoenFoto("kerst", "/dashboard/klussen")?.src).toBe("/seizoen/kerst-werker.jpg");
    expect(seizoenFoto("kerst", "/dashboard")?.src).toBe("/seizoen/kerst-werker.jpg");
    expect(seizoenFoto("kerst", "/werkgever")?.src).toBe("/seizoen/kerst.jpg");
    expect(seizoenFoto("kerst", "/")?.src).toBe("/seizoen/kerst.jpg");
    expect(seizoenFoto("sinterklaas", "/dashboard")?.src).toBe("/seizoen/sinterklaas.jpg");
    for (const regel of Object.values(SEIZOEN_FOTOS)) {
      if (regel.werker) expect(existsSync(join(MAP, `${regel.werker.bestand}.jpg`))).toBe(true);
    }
  });

  it("elk bestand in de map staat in CREDITS.md en wordt gebruikt", () => {
    const credits = readFileSync(join(MAP, "CREDITS.md"), "utf8");
    const gebruikt = new Set<string>();
    for (const [id, regel] of Object.entries(SEIZOEN_FOTOS)) {
      gebruikt.add(`${id}.jpg`);
      if (regel.werker) gebruikt.add(`${regel.werker.bestand}.jpg`);
    }
    for (const naam of readdirSync(MAP).filter((n) => n.endsWith(".jpg"))) {
      expect(credits, naam).toContain(naam);
      expect(gebruikt.has(naam), `${naam} wordt nergens gebruikt`).toBe(true);
    }
  });

  it("de kaart in de feestlaag is alleen versiering: geen link, geen pointer events, weg bij afdrukken", () => {
    const bron = readFileSync(join(ROOT, "components", "seasons", "SeasonalDecor.tsx"), "utf8");
    expect(bron).toContain('import { seizoenFoto } from "@/lib/seasons/foto"');
    expect(bron).toMatch(/\.zfs-kaart\{[^}]*pointer-events:none/);
    expect(bron).toMatch(/@media print\{[^}]*\.zfs-kaart/);
    expect(bron).toContain('className="zfs-kaart" aria-hidden="true"');
    expect(bron).not.toMatch(/zfs-kaart[\s\S]{0,400}<a /);
    // alleen op wijde schermen: op een telefoon nooit over de onderbalk
    expect(bron).toMatch(/@media \(min-width:768px\)\{\.zfs-kaart\{display:block\}\}/);
  });
});
