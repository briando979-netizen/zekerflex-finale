import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import { herinneringInhoud } from "@/lib/onboarding/voortgang";
import { WERKGEVER_STAPPEN } from "@/lib/onboarding/werkgever-teksten";

// 22 nov 2026 (eigenaar): "Ik wil nergens meer tests, klussen, reacties, e-mails of teksten zien. Test is er niet meer. We gaan nu echt
// live." Een bedrijf dat nog niet is goedgekeurd (lib/company/verified.ts) mag één klus plaatsen en kan nog niet inplannen; die regel blijft,
// maar de woorden "testklus", "proefklus" en "test job" horen niet meer in wat een bedrijf, een werkgever of een bezoeker leest: de
// werkgeverspagina's, de wizard, de bedrijfsmails, de hulp, de kennisbank en de teksten van de poort zelf.
// Bewust buiten deze bewaker: de herkenning van testklussen (lib/shifts/testklus.ts), de beheerschermen en de werker-app.

const ROOT = process.cwd();
const TESTWOORD = /test[\s-]?klus|test[\s-]?jobs?\b|testfase|proefklus|testgegevens|testopdracht/i;

function bestanden(dir: string, ext: RegExp, uit: string[] = []): string[] {
  for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) bestanden(rel, ext, uit);
    else if (ext.test(e.name) && statSync(path.join(ROOT, rel)).isFile()) uit.push(rel);
  }
  return uit;
}

const BRONNEN: string[] = [
  ...bestanden("app/werkgever", /\.tsx?$/),
  ...bestanden("components/werkgever", /\.tsx?$/),
  ...bestanden("lib/company", /\.ts$/),
  ...bestanden("docs/kennisbank/20-opdrachtgevers", /\.md$/),
  "docs/kennisbank/30-intern/01-controle-en-onboarding.md",
  "components/app/OpbouwfaseBalk.tsx",
  "components/app/EmployerOnboardingWizard.tsx",
  "lib/hulp/werkgever-teksten.ts",
  "lib/mail/index.ts",
  "lib/mail/werker/welkom.ts",
  "lib/onboarding/employer.ts",
  "lib/onboarding/voortgang.ts",
  "lib/onboarding/werkgever-teksten.ts",
  "lib/i18n/dictionaries.ts",
  "lib/i18n/dictionary-en.ts",
];

describe("geen testwoord in wat een bedrijf leest", () => {
  it("de bewaker ziet de werkgeverspagina's en de bedrijfsteksten", () => {
    expect(BRONNEN.length).toBeGreaterThan(40);
    expect(BRONNEN).toContain("app/werkgever/diensten/[shiftId]/page.tsx");
    expect(BRONNEN).toContain("lib/company/verified.ts");
  });

  it.each(BRONNEN)("%s noemt geen testklus, proefklus of test job", (bestand) => {
    const tekst = readFileSync(path.join(ROOT, bestand), "utf8");
    const regels = tekst.split(/\r?\n/).flatMap((r, i) => (TESTWOORD.test(r) ? [`${i + 1}: ${r.trim().slice(0, 120)}`] : []));
    expect(regels).toEqual([]);
  });

  it("de woordenboeken (Nederlands en Engels) hebben het woord niet meer", () => {
    expect(JSON.stringify(nl)).not.toMatch(TESTWOORD);
    expect(JSON.stringify(en)).not.toMatch(TESTWOORD);
  });

  it("de herinneringen en stappen voor een bedrijf zeggen gewoon: één klus", () => {
    const teksten = [
      herinneringInhoud("bedrijf-gegevens").why,
      herinneringInhoud("bedrijf-verificatie").why,
      WERKGEVER_STAPPEN.verificatie.why,
    ];
    for (const t of teksten) {
      expect(t).not.toMatch(TESTWOORD);
      expect(t).toContain("één klus");
      expect(t).toContain("inplannen");
    }
  });
});

describe("de poort blijft kloppen: één klus, nog niet inplannen (Nederlands en Engels)", () => {
  it("de kop en tekst op de klus-pagina van een bedrijf in controle", () => {
    expect(nl.shiftDetail.controleTitel).toBe("Je bedrijf wordt nog gecontroleerd");
    expect(en.shiftDetail.controleTitel).toBe("Your company is still being checked");
    for (const d of [nl.shiftDetail, en.shiftDetail]) {
      // het label van de lijst met reacties komt uit queueResponded, zodat tekst en lijst hetzelfde woord gebruiken
      expect(d.controleTekst).toContain("{label}");
      expect(d.queueResponded.length).toBeGreaterThan(3);
    }
    expect(nl.shiftDetail.controleTekst).toContain("Inplannen kan zodra je bedrijf is goedgekeurd");
    expect(en.shiftDetail.controleTekst).toContain("once your company is approved");
  });

  it("het startscherm en de wizard noemen één klus en de handmatige controle", () => {
    expect(nl.werkgeverStart.eenKlusVet).toBe("klus");
    expect(en.werkgeverStart.eenKlusVet).toBe("job");
    expect(nl.werkgeverStart.kvkNodig).toContain("Dan controleren wij je bedrijf zelf; je hoort binnen één werkdag van ons.");
    expect(en.werkgeverStart.kvkNodig).toContain("Then we check your company ourselves; you will hear from us within one working day.");
    for (const o of [nl.onboarding, en.onboarding]) {
      expect(o.kvkInControle).toContain("{name}");
      expect(o.kvkInControleForeign).toContain("{name}");
    }
    expect(nl.onboarding.kvkInControle).toContain("één klus plaatsen");
    expect(en.onboarding.kvkInControleForeign).toContain("post one job");
  });

  it("de klus-pagina haalt de tekst uit het woordenboek, geen vaste zin met het woord erin", () => {
    const pagina = readFileSync(path.join(ROOT, "app/werkgever/diensten/[shiftId]/page.tsx"), "utf8");
    expect(pagina).toContain("d.controleTitel");
    expect(pagina).toContain("d.controleTekst");
    expect(pagina).toContain("d.queueResponded");
  });
});
