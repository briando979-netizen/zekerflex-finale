import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import { SNEL_EN, SNEL_NL } from "@/components/werkgever/snel-teksten";

// 23 nov 2026 (schermcontrole van de live wizard): op /werkgever/diensten/nieuw?snel=1 stond boven de korte weg de regel "Kies een functie
// of vul het zelf in", die bij de kiezer van het uitgebreide formulier hoort. De korte weg houdt alleen de tweede zin.

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

describe("de regel onder de kop van Klus uitzetten", () => {
  it("het uitgebreide formulier houdt 'Kies een functie of vul het zelf in' (Nederlands en Engels)", () => {
    expect(nl.newShift.subtitle).toBe("Kies een functie of vul het zelf in. Je klus komt bij geverifieerde werkers in de buurt; jij kiest wie je inroostert.");
    expect(en.newShift.subtitle).toBe("Pick a role or fill it in yourself. Your job reaches verified workers nearby; you choose who you schedule.");
  });

  it("de korte weg (?snel=1) heeft alleen de tweede zin, zonder de oproep om een functie te kiezen", () => {
    expect(nl.newShift.subtitleSnel).toBe("Je klus komt bij geverifieerde werkers in de buurt; jij kiest wie je inroostert.");
    expect(en.newShift.subtitleSnel).toBe("Your job reaches verified workers nearby; you choose who you schedule.");
    expect(nl.newShift.subtitleSnel).not.toMatch(/Kies een functie|vul het zelf in/i);
    expect(en.newShift.subtitleSnel).not.toMatch(/Pick a role|fill it in yourself/i);
  });

  it("de korte tekst is precies de tweede zin van de volledige tekst (één bron voor wat er verder staat)", () => {
    expect(nl.newShift.subtitle.endsWith(nl.newShift.subtitleSnel)).toBe(true);
    expect(en.newShift.subtitle.endsWith(en.newShift.subtitleSnel)).toBe(true);
  });

  it("de pagina kiest de regel per weg, en de korte weg zelf heeft de oproep nergens", () => {
    const pagina = lees("app/werkgever/diensten/nieuw/page.tsx");
    expect(pagina).toContain("subtitle={snelModus ? n.subtitleSnel : n.subtitle}");
    expect(pagina).toContain('const snelModus = alleenFlexwerk && snelParam === "1";');
    expect(Object.values(SNEL_NL).join(" ")).not.toMatch(/Kies een functie of vul het zelf in/i);
    expect(Object.values(SNEL_EN).join(" ")).not.toMatch(/Pick a role or fill it in yourself/i);
  });
});
