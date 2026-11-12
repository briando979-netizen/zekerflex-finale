import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eersteFocus, isTrackCode } from "@/lib/analytics/label-privacy";
import { HOOFDKNOP } from "@/lib/admin/werkgever-trechter-kern";

// Meetcodes op /klus-plaatsen (12 nov 2026): waar haakt een gast af? Alleen codes, nooit wat iemand intypt, en een focus
// telt één keer per veld per sessie (geen oplopend aantal events).

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("eersteFocus: één keer per veld per sessie, alleen geldige codes", () => {
  it("de eerste focus telt, een tweede op hetzelfde veld niet; een ander veld of pad wel", () => {
    const gezien = new Set<string>();
    expect(eersteFocus(gezien, "/klus-plaatsen", "klus-plaats")).toBe(true);
    expect(eersteFocus(gezien, "/klus-plaatsen", "klus-plaats")).toBe(false);
    expect(eersteFocus(gezien, "/klus-plaatsen", "klus-datum")).toBe(true);
    expect(eersteFocus(gezien, "/andere-pagina", "klus-plaats")).toBe(true);
  });
  it("geen code of geen geldige code: nooit tellen (dus ook geen ingevulde tekst)", () => {
    const gezien = new Set<string>();
    for (const c of [null, undefined, "", "Utrecht", "jan@voorbeeld.test", "klus plaats", "KLUS-PLAATS"]) {
      expect(eersteFocus(gezien, "/klus-plaatsen", c), String(c)).toBe(false);
    }
    expect(gezien.size).toBe(0);
    expect(isTrackCode("klus-plaatsknop")).toBe(true);
  });
});

describe("het formulier en de beacon", () => {
  it("KlusConcept heeft de codes op de velden, de knop en de kaart", () => {
    const s = bron("components/marketing/KlusConcept.tsx");
    for (const code of ["klus-website", "klus-functie", "klus-plaats", "klus-datum", "klus-tijd", "klus-plaatsknop"]) {
      expect(s, code).toContain(`data-track="${code}"`);
    }
    expect(s).toContain('data-track-ctx="stap=klus-concept"');
  });
  it("de beacon telt een focus met eersteFocus en telt een klik in een veld niet dubbel", () => {
    const s = bron("components/analytics/AnalyticsBeacon.tsx");
    expect(s).toContain('addEventListener("focusin", onFocus');
    expect(s).toContain("eersteFocus(gezienFocus, pad, code)");
    expect(s).toContain('if (el.matches("input, select, textarea")) return;');
    // nooit de waarde van een veld in een event
    expect(s).not.toMatch(/\.value\b/);
  });
  it("de werkgeverstrechter telt de plaatsknop ook met zijn nieuwe code", () => {
    expect(HOOFDKNOP.test("klus-plaatsknop")).toBe(true);
    expect(HOOFDKNOP.test("Plaats deze klus met een gratis account")).toBe(true);
    expect(HOOFDKNOP.test("klus-plaats")).toBe(false);
  });
});
