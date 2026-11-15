import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KLUS_STUK_HREF, nogVoorEersteKlus, type KlusFeiten } from "@/lib/onboarding/klaar-voor-klus";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// Na de 5 stappen van de aanmelding: één lijst met wat er nog nodig is om te reageren (15 nov, eigenaar: "niet strak,
// loopt gelijk, onoverzichtelijk"). Dezelfde regels als payoutEligibility (lib/fiscal/eligibility.ts).

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const basis: KlusFeiten = { soort: "uitzendkracht", payroll: true, idGoedgekeurd: true, bsn: true, contract: true, bedrijf: false, kvkWacht: false, iban: true, werkrechtOpen: false };

describe("nogVoorEersteKlus", () => {
  it("uitzendkracht: BSN, overeenkomst en rekeningnummer; KVK/btw doet er niet toe", () => {
    expect(nogVoorEersteKlus(basis)).toEqual([]);
    expect(nogVoorEersteKlus({ ...basis, bsn: false, contract: false, iban: false })).toEqual(["bsn", "contract", "iban"]);
  });

  it("zzp'er en flexwerker: KVK, btw of KOR en een rekeningnummer; geen BSN of overeenkomst", () => {
    const zzp: KlusFeiten = { ...basis, soort: "zzp", payroll: false, bsn: false, contract: false };
    expect(nogVoorEersteKlus(zzp)).toEqual(["bedrijf"]);
    expect(nogVoorEersteKlus({ ...zzp, bedrijf: true })).toEqual([]);
    expect(nogVoorEersteKlus({ ...zzp, soort: "flexwerker", iban: false })).toEqual(["bedrijf", "iban"]);
  });

  it("het nakijken van het ID staat als laatste: daar hoeft de werker niets voor te doen", () => {
    expect(nogVoorEersteKlus({ ...basis, idGoedgekeurd: false, iban: false })).toEqual(["iban", "idWacht"]);
    expect(KLUS_STUK_HREF.idWacht).toBeNull();
  });

  it("wacht de KVK-controle, dan zegt de lijst dat (zonder knop) in plaats van om het nummer te vragen", () => {
    const zzp: KlusFeiten = { ...basis, soort: "zzp", payroll: false, bedrijf: false, kvkWacht: true };
    expect(nogVoorEersteKlus(zzp)).toEqual(["kvkWacht"]);
    expect(KLUS_STUK_HREF.kvkWacht).toBeNull();
    // bij een uitzendkracht speelt de KVK geen rol
    expect(nogVoorEersteKlus({ ...basis, kvkWacht: true })).toEqual([]);
  });

  it("het recht om te werken alleen als de vlag het eist", () => {
    expect(nogVoorEersteKlus({ ...basis, werkrechtOpen: true })).toEqual(["werkrecht"]);
  });

  it("elke knop springt naar een plek die op de verificatiepagina bestaat", () => {
    const pagina = lees("app/dashboard/verificatie/page.tsx");
    for (const href of Object.values(KLUS_STUK_HREF)) {
      if (!href) continue;
      const [pad, anker] = href.split("#");
      expect(pad).toBe("/dashboard/verificatie");
      expect(pagina, anker).toContain(`"${anker}"`);
    }
    // het blok "Nog nodig vóór je eerste klus" heeft in beide standen van de pagina hetzelfde anker
    expect(pagina.match(/kopId="gegevens-later-kop"/g)?.length).toBe(2);
  });

  it("de teksten staan er in alle vijf talen", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      const t = d.klaarVoorKlus;
      for (const k of ["idWacht", "bsn", "contract", "bedrijf", "kvkWacht", "iban"] as const) {
        expect(t[k].kop.length, `${taal} ${k}`).toBeGreaterThan(3);
        expect(t[k].hint.length, `${taal} ${k}`).toBeGreaterThan(3);
      }
      expect(t.uitlegMeer, taal).toContain("{n}");
      // "Je gegevens" vraagt naam, geboortedatum, telefoon en postcode; KVK/btw/BSN/IBAN komen pas vóór de eerste klus
      expect(d.start.gegevensBody, taal).not.toMatch(/KVK|btw|VAT|BSN|IBAN/i);
    }
  });
});

describe("Verificatie: het eindscherm is de plek om het in te vullen", () => {
  const pagina = lees("app/dashboard/verificatie/page.tsx");
  it("geen oude checklist met eigen teller, en 'je bent klaar' alleen als reageren kan", () => {
    // de lijst van Ontdekken staat hier niet (dubbel met het invulblok, eindtest 16 nov); wel het invulblok
    expect(pagina).not.toContain("<KlaarVoorKlusKaart");
    expect(pagina).toContain('<GegevensMist mist={voorKlus} later kopId="gegevens-later-kop"');
    expect(pagina).not.toContain("o.onboarding.map");
    expect(pagina).not.toContain("nogStappenTekst");
    expect(pagina).toContain('const echtKlaar = volgende === "klaar" && nogVoorKlus.length === 0;');
    expect(pagina).toContain("{echtKlaar && (");
    // geen losse ID-upload of tweede bankwaarschuwing onder Documenten
    expect(pagina).not.toMatch(/<ComplianceDocsPanel \/>/);
  });
});

describe("Klussen: één kaart tegelijk", () => {
  const klussen = lees("app/dashboard/klussen/page.tsx");
  it("eerst de stappen, dan Klaar voor je eerste klus, anders de echte reden", () => {
    const stappen = klussen.indexOf("<WerkerStartWizard");
    const klaar = klussen.indexOf("<KlaarVoorKlusKaart");
    const reden = klussen.indexOf("translateBlockReason(m.blockReason, t)} {t.page.applyWhenDone}");
    expect(stappen).toBeGreaterThan(0);
    expect(klaar).toBeGreaterThan(stappen);
    expect(reden).toBeGreaterThan(klaar);
    // geen tweede startkaart, geen OnboardingProgress, geen filter dat de echte reden verbergt
    expect(klussen.match(/<WerkerStartWizard/g)).toHaveLength(1);
    expect(klussen).not.toContain("OnboardingProgress");
    expect(klussen).not.toContain("!/verificatie|geverifieerd/i.test");
    // testaccounts zien de stappen ook (alleen reageren mag voor hen altijd)
    expect(klussen).not.toContain("isReservedTestAddress");
  });
});
