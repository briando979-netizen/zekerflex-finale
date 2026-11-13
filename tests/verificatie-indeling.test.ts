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
  it("het BSN en de uitzendovereenkomst staan onder Later: sinds 13 nov vóór de eerste klus, niet bij de aanmelding", () => {
    const formulier = pagina.indexOf("<OnboardingForm");
    const later = pagina.indexOf('aria-labelledby="later-kop"');
    expect(later).toBeGreaterThan(formulier);
    expect(pagina).not.toContain('mist.includes("contract")');
    expect(pagina.indexOf("{isUitzend && (", later)).toBeGreaterThan(later);
    expect(pagina.indexOf('<GegevensMist mist={voorKlus} later kopId="gegevens-later-kop"', later)).toBeGreaterThan(later);
    // ook op het eindscherm, met het voorstel uit de ID-scan
    expect(pagina).toContain('<GegevensMist mist={voorKlus} later soort={uitzend ? "uitzendkracht" : null} bsnVoorstel={bsnVoorstel} />');
    expect(pagina).toContain("voorKlus={voorKlus}");
  });

  it("de teksten voor 'vóór je eerste klus' in vijf talen, en de uitleg bij de start noemt het BSN als later", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      expect(d.gegevensMist.titelLater.length, taal).toBeGreaterThan(5);
      expect(d.gegevensMist.uitlegLater.length, taal).toBeGreaterThan(10);
      expect(d.start.gegevensUitzend, taal).toMatch(/BSN/);
      if (taal !== "nl") expect(d.gegevensMist.titelLater, taal).not.toBe(FREELANCER_DICTS.nl.gegevensMist.titelLater);
    }
    expect(FREELANCER_DICTS.nl.start.gegevensUitzend).toMatch(/vóór je eerste klus/);
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

describe("alleen tonen wat open staat (13 nov, 86)", () => {
  it("zijn persoon, woon en ID af, dan geen formulier meer (ook niet 'Waar woon je?')", () => {
    const pagina = bron("app/dashboard/verificatie/page.tsx");
    expect(pagina).toContain("const formulierNodig = !(persoon.klaar && woonKlaar && idKlaar);");
    expect(pagina).toContain("{formulierNodig && (\n        <OnboardingForm");
  });

  it("de uitzendnoot noemt het BSN niet als het al bekend is, en nooit het rekeningnummer", () => {
    const form = bron("components/app/OnboardingForm.tsx");
    expect(form).toContain("{bsnBekend ? t.uitzendNoteZonderBsn : t.uitzendNote}");
    expect(bron("app/dashboard/verificatie/page.tsx")).toContain("bsnBekend={Boolean(fiscal.bsnHash)}");
    for (const [taal, d] of Object.entries(AUTH_DICTS)) {
      expect(d.onb.uitzendNoteZonderBsn, taal).not.toMatch(/BSN/);
      expect(d.onb.uitzendNoteZonderBsn, taal).not.toMatch(/rekeningnummer|bank account|numer konta|contul bancar|рахунок|IBAN/i);
      if (taal !== "nl") expect(d.onb.uitzendNoteZonderBsn, taal).not.toBe(AUTH_DICTS.nl.onb.uitzendNoteZonderBsn);
    }
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
