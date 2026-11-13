import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 13 nov 2026, eigenaar: "onoverzichtelijk". Fase B van het voorstel van d4 (goedgekeurd door 86): elk ding op zijn plek.
// De uitzendovereenkomst bij de gegevens (stap 3), de vorige ID-poging in de ID-stap (stap 4), en wat pas voor de eerste
// uitbetaling nodig is (bank, werkrecht, StiPP en loonheffingskorting) in een apart blok "Later". Plus een geteld totaal
// van de soort ID-scan per maand, zonder persoonsgegevens (86: geen landcode per persoon).

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
}));

import { idSoortSleutel, idSoortTeller, telIdSoort } from "@/lib/kyc/id-soort-meting";
import { AUTH_DICTS } from "@/lib/i18n/auth";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
beforeEach(() => h.kv.clear());

describe("de verificatiepagina: elk ding op zijn plek", () => {
  const pagina = bron("app/dashboard/verificatie/page.tsx");
  it("de uitzendovereenkomst staat bij de gegevens zolang hij niet getekend is, daarna onder Later", () => {
    const boven = pagina.indexOf("{isUitzend && mist.includes(\"contract\") && (");
    const formulier = pagina.indexOf("<OnboardingForm");
    const later = pagina.indexOf('aria-labelledby="later-kop"');
    expect(boven).toBeGreaterThan(pagina.indexOf("<GegevensMist"));
    expect(boven).toBeLessThan(formulier);
    expect(later).toBeGreaterThan(formulier);
    expect(pagina.indexOf("{isUitzend && !mist.includes(\"contract\") && (")).toBeGreaterThan(later);
    // het anker voor "Naar de overeenkomst" bestaat in beide gevallen precies één keer per stand
    expect(pagina.slice(pagina.indexOf("<GegevensMist")).match(/id="uitzendovereenkomst"/g)?.length).toBe(2);
  });

  it("bank en werkrecht staan onder Later, de vorige ID-poging in de ID-stap", () => {
    const later = pagina.indexOf('aria-labelledby="later-kop"');
    expect(pagina.indexOf("<ComplianceDocsPanel idInForm />")).toBeGreaterThan(later);
    expect(pagina.indexOf("<WerkrechtPanel />", later)).toBeGreaterThan(later);
    expect(pagina).toContain("laatstePoging={");
    const form = bron("components/app/OnboardingForm.tsx");
    expect(form).toContain('<div hidden={stap !== "id"} className="space-y-5" key={attempt}>\n            {laatstePoging}');
    // geen verwijzing meer naar de weggehaalde bestandskeuze
    expect(pagina).not.toContain("Zelf foto&apos;s uploaden");
  });

  it("de teksten in vijf talen, en de uitleg waar het BSN staat", () => {
    for (const [taal, d] of Object.entries(AUTH_DICTS)) {
      for (const k of ["uitzendTitel", "laterTitel", "laterUitleg"] as const) expect(d.page[k].length, `${taal} ${k}`).toBeGreaterThan(5);
    }
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) expect(d.gegevensMist.bsn.hint, taal).toMatch(/RNI/);
    expect(FREELANCER_DICTS.nl.gegevensMist.bsn.hint).toMatch(/achterkant van je ID-kaart/);
  });
});

describe("meetcodes op de nieuwe knoppen (alleen codes)", () => {
  it("auto/zelf, de wissel, chip, controle, BSN-voorstel en het btw-veld hebben een data-track-code", () => {
    const alles = ["components/app/WieBenJijIdKaarten.tsx", "components/app/IdScan.tsx", "components/app/GegevensMist.tsx"].map(bron).join("\n");
    for (const c of ["id-start-nl-auto", "id-start-eu-auto", "id-start-nl-zelf", "id-start-eu-zelf", "id-zelf-wissel-traag", "id-zelf-wissel-kan-niet", "id-chip-start", "id-chip-overslaan", "id-controle-indienen", "id-controle-terug", "id-foto-gebruik", "id-foto-opnieuw", "bsn-voorstel-ja", "bsn-voorstel-nee", "gegevens-btw", "gegevens-btw-aangevraagd", "gegevens-kor", "gegevens-btw-opslaan"]) {
      expect(alles, c).toContain(`data-track="${c}"`);
      expect(c).toMatch(/^[a-z0-9][a-z0-9-]{0,59}$/);
    }
  });
});

describe("geteld totaal van de soort ID-scan (geen persoonsgegeven)", () => {
  it("NL-paspoort en -ID-kaart van model 2021+ apart, al het andere als overig", () => {
    expect(idSoortTeller({ land: "NLD", soort: "PASSPORT", vervaldatum: "2033-01-01" })).toBe("nld_paspoort_2021");
    expect(idSoortTeller({ land: "NLD", soort: "ID_CARD", vervaldatum: "2031-08-02" })).toBe("nld_idkaart_2021");
    expect(idSoortTeller({ land: "NLD", soort: "ID_CARD", vervaldatum: "2031-08-01" })).toBe("overig");
    expect(idSoortTeller({ land: "BEL", soort: "ID_CARD", vervaldatum: "2034-01-01" })).toBe("overig");
    expect(idSoortTeller({ land: "NLD", soort: "PASSPORT", vervaldatum: null })).toBe("overig");
  });

  it("telt per maand (Nederlandse tijd), alleen drie getallen en verder niets", async () => {
    const nu = new Date("2026-11-30T23:30:00Z"); // in Nederland al 1 december
    await telIdSoort({ land: "NLD", soort: "PASSPORT", vervaldatum: "2033-01-01" }, nu);
    await telIdSoort({ land: "NLD", soort: "PASSPORT", vervaldatum: "2033-01-01" }, nu);
    await telIdSoort({ land: "DEU", soort: "ID_CARD", vervaldatum: "2030-01-01" }, nu);
    expect(idSoortSleutel(nu)).toBe("meting:id-soort:2026-12");
    expect(h.kv.get("meting:id-soort:2026-12")).toEqual({ nld_paspoort_2021: 2, nld_idkaart_2021: 0, overig: 1 });
    expect([...h.kv.keys()]).toEqual(["meting:id-soort:2026-12"]);
  });

  it("verify.ts telt alleen bij een geldige MRZ, na het antwoord, zonder userId", () => {
    const v = bron("lib/onboarding/verify.ts");
    const blok = v.slice(v.indexOf("if (mrzGeldig && mrz) {"), v.indexOf("// ID geverifieerd: de werker hoort het meteen"));
    expect(blok).toContain("runAfter(");
    expect(blok).toContain("telIdSoort(gelezen)");
    expect(blok).not.toMatch(/user\.id|userId/);
  });
});
