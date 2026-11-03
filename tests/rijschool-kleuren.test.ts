import { describe, expect, it } from "vitest";
import { contrast, CREME, knop, leesbaarOpDonker, leesbaarOpLicht, meng, NACHT, siteKleuren, tekstOp } from "@/lib/rijschool/kleuren";

const PROEF = ["#1D4E89", "#F2B544", "#FFFF00", "#00FF00", "#FF5F1F", "#FFFFFF", "#000000", "#7F7F7F", "#E91E63", "#00BCD4"];

describe("kleuren van een rijschoolsite", () => {
  it("tekst op een knop is altijd leesbaar (AA)", () => {
    for (const k of PROEF) {
      const b = knop(k);
      expect(contrast(b.achtergrond, b.tekst)).toBeGreaterThanOrEqual(4.5);
    }
    // waar het kan, blijft de knop gewoon de eigen kleur
    expect(knop("#F2B544").achtergrond).toBe("#F2B544");
    expect(tekstOp("#F2B544")).toBe(NACHT);
  });

  it("kleine tekst in de merkkleur op crème is altijd leesbaar", () => {
    for (const k of PROEF) expect(contrast(leesbaarOpLicht(k), CREME)).toBeGreaterThanOrEqual(4.5);
  });

  it("het accent op de donkere hero is altijd leesbaar", () => {
    for (const k of PROEF) {
      const nacht = meng(k, NACHT, 0.28);
      expect(contrast(leesbaarOpDonker(k, nacht), nacht)).toBeGreaterThanOrEqual(4.5);
      // en crème (en gedimd crème, 80%) op die nacht ook: hero en voettekst
      expect(contrast(CREME, nacht)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(meng(CREME, nacht, 0.8), nacht)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("een rare kleur valt terug op de standaard", () => {
    const v = siteKleuren({ kleur: "rood", accent: "javascript:alert(1)" });
    expect(v["--rs-kleur"]).toBe("#1D4E89");
    expect(v["--rs-accent"]).toBe("#F2B544");
  });
});
