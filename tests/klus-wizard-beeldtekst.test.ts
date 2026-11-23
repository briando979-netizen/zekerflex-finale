import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

// 23 nov 2026 (schermcontrole van de live wizard): "Je klussen tonen een foto van de branche" en het label "Foto van de branche"
// klopten niet meer nu het voorbeeld in de wizard een kleurvlak toont. De werker-app en de openbare pagina's tonen nog wel de
// branchefoto's: de tekst zegt dus wat het bedrijf kan kiezen (branchebeeld of ons logo), niet wat het voorbeeld toont. De keuze zelf
// ("foto" of "logo", PUT /api/werkgever/klus-beeld) is niet veranderd.

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

describe("de tekst bij 'Beeld bij je klus'", () => {
  it("Nederlands: kop, keuzes en uitleg zeggen branchebeeld of logo", () => {
    expect(nl.newShiftForm.beeldKop).toBe("Beeld bij je klus");
    expect(nl.newShiftForm.beeldFoto).toBe("Branchebeeld");
    expect(nl.newShiftForm.beeldLogo).toBe("Ons logo");
    expect(nl.newShiftForm.beeldGeenLogo).toBe("Bij je klussen hoort een branchebeeld. Wil je liever je eigen logo erop?");
  });

  it("Engels: kop, keuzes en uitleg zeggen industry image or logo", () => {
    expect(en.newShiftForm.beeldKop).toBe("Image for your job");
    expect(en.newShiftForm.beeldFoto).toBe("Industry image");
    expect(en.newShiftForm.beeldLogo).toBe("Our logo");
    expect(en.newShiftForm.beeldGeenLogo).toBe("Your jobs come with an industry image. Want your own logo on them instead?");
  });

  it("geen enkele tekst bij het beeld belooft nog een foto (het voorbeeld toont een vlak, de app de branchefoto)", () => {
    for (const [taal, d] of [["nl", nl.newShiftForm], ["en", en.newShiftForm]] as const) {
      for (const k of ["beeldKop", "beeldFoto", "beeldLogo", "beeldGeldt", "beeldBeheerder", "beeldGeenLogo", "beeldUpload"] as const) {
        expect(d[k], `${taal} ${k}`).not.toMatch(/foto|photo/i);
      }
    }
  });

  it("de keuze zelf is niet veranderd: dezelfde knoppen en dezelfde waarden naar de server", () => {
    const form = lees("components/app/NewShiftForm.tsx");
    expect(form).toContain("onClick={() => void kiesBeeld(false)} label={n.beeldFoto}");
    expect(form).toContain("onClick={() => void kiesBeeld(true)} label={n.beeldLogo}");
    expect(form).toContain('JSON.stringify({ beeld: logo ? "logo" : "foto" })');
    expect(form).toContain("{n.beeldGeenLogo}");
    const route = lees("app/api/werkgever/klus-beeld/route.ts");
    expect(route).toContain('z.enum(["foto", "logo"])');
  });

  it("de kennisbank noemt dezelfde kop en keuzes", () => {
    const doc = lees("docs/kennisbank/20-opdrachtgevers/04-een-klus-uitzetten.md");
    expect(doc).toContain("Bij **Beeld bij je klus** kies je **Branchebeeld** of **Ons logo**.");
    expect(doc).not.toContain("Foto van de branche");
  });
});
