import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ID_BEGINNEN, ID_KAART } from "@/lib/onboarding/id-kaart-teksten";
import { SCAN_EXTRA } from "@/lib/i18n/scan-extra";

// Meting 12 nov (cohort sinds 10 nov, gegevens klaar): 6 werkers staan bij de ID-stap stil. 5 van hen starten de ID-scan niet ('Laten we
// beginnen' 0 van 5; bij de werkers die wel instuurden 7 van 9), er is geen poging zonder insturen en er staat geen camera- of uploadfout in het
// logboek. Dus: een kaart die zegt wat er nog moet (naar de bestaande ID-stap) en een duidelijkere startknop. Geen tweede startpad.

const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("de teksten in vijf talen", () => {
  it("elke taal heeft kop, tekst en knop, echt vertaald", () => {
    for (const taal of TALEN) {
      const k = ID_KAART[taal];
      for (const v of Object.values(k)) expect(v.length, taal).toBeGreaterThan(8);
      if (taal !== "nl") {
        expect(k.kop, taal).not.toBe(ID_KAART.nl.kop);
        expect(k.knop, taal).not.toBe(ID_KAART.nl.knop);
      }
      expect(ID_BEGINNEN[taal].length, taal).toBeGreaterThan(8);
    }
  });

  it("de hoofdknop van het introscherm van de ID-scan zegt wat er gebeurt (was 'Laten we beginnen'), in alle vijf talen", () => {
    for (const taal of TALEN) {
      expect(SCAN_EXTRA[taal].beginnen, taal).toBe(ID_BEGINNEN[taal]);
    }
    const src = bron("lib/i18n/scan-extra.ts");
    for (const oud of ["Laten we beginnen", "Let's get started", "Zaczynamy", "Să începem", "Почнімо"]) expect(src, oud).not.toContain(oud);
  });
});

describe("de kaart op Verificatie", () => {
  const page = bron("app/dashboard/verificatie/page.tsx");

  it("verschijnt alleen als de gegevens klaar zijn en de ID nog de volgende stap is, met de taal van de werker", () => {
    expect(page).toContain('begin === "id" && mist.length === 0');
    expect(page).toContain("ID_KAART[locale]");
    expect(page).toContain('href="#id-stap"');
  });

  it("de kaart zit boven het formulier, en het anker is de bestaande ID-stap in OnboardingForm (focusbaar)", () => {
    expect(page.indexOf('href="#id-stap"')).toBeLessThan(page.indexOf("<OnboardingForm"));
    expect(bron("components/app/OnboardingForm.tsx")).toContain('id="id-stap" tabIndex={-1}');
  });

  it("geen tweede startpad: IdScan en ComplianceDocsPanel zijn niet aangeraakt en kennen de kaart niet", () => {
    for (const f of ["components/app/IdScan.tsx", "components/app/ComplianceDocsPanel.tsx"]) {
      const s = bron(f);
      expect(s, f).not.toContain("id-stap");
      expect(s, f).not.toContain("id-kaart");
    }
    // de kaart is een anker, geen knop met eigen camera-/uploadcode
    const kaart = page.slice(page.indexOf('<section aria-labelledby="id-kaart-kop"'), page.indexOf("</section>", page.indexOf('<section aria-labelledby="id-kaart-kop"')));
    expect(kaart).not.toMatch(/getUserMedia|fetch\(|onClick|IdScan/);
  });

  it("de kaart is toegankelijk: kop met id, doelgrootte 44 px, en gebruikt de verificatiekleur (violet = verificatie)", () => {
    expect(page).toContain('aria-labelledby="id-kaart-kop"');
    expect(page).toContain("min-h-[44px]");
    expect(page).toContain("trust");
  });
});
