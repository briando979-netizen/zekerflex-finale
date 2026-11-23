import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import { herinneringInhoud } from "@/lib/onboarding/voortgang";
import { WERKGEVER_STAPPEN, WERKGEVER_STAPPEN_EN } from "@/lib/onboarding/werkgever-teksten";

// 22 nov 2026 (eigenaar): "Ik wil nergens meer tests, klussen, reacties, e-mails of teksten zien. Test is er niet meer. We gaan nu echt
// live." Een bedrijf dat nog niet is goedgekeurd (lib/company/verified.ts) kan nog niet inplannen (sinds 23 nov 2026 mag het wel zoveel
// klussen plaatsen als het wil); de woorden "testklus", "proefklus" en "test job" horen niet meer in wat een bedrijf, een werkgever of een bezoeker leest: de
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

  it("de herinneringen en stappen voor een bedrijf zeggen gewoon dat een klus meteen live staat", () => {
    const teksten = [
      herinneringInhoud("bedrijf-adres").why,
      herinneringInhoud("bedrijf-klus").why,
      WERKGEVER_STAPPEN.klus.why,
      WERKGEVER_STAPPEN_EN.klus.why,
    ];
    for (const t of teksten) {
      expect(t).not.toMatch(TESTWOORD);
      expect(t).toMatch(/meteen live|straight away|goes live/i);
    }
  });
});

describe("de poort (23 nov 2026): plaatsen en reacties zijn vrij, de controle komt bij het inplannen (Nederlands en Engels)", () => {
  it("de klus-pagina van een bedrijf dat nog niet is gecontroleerd zegt dat de klus live staat, en waarschuwt niet", () => {
    for (const d of [nl.shiftDetail, en.shiftDetail]) {
      expect(d.liveTitel.length).toBeGreaterThan(5);
      expect(d.liveTekst.length).toBeGreaterThan(20);
      expect(d.bewaardTitel.length).toBeGreaterThan(5);
      expect(d.bewaardTekst.length).toBeGreaterThan(20);
      expect(d.queueResponded.length).toBeGreaterThan(3);
    }
    expect(nl.shiftDetail.liveTitel).toBe("Je klus staat live");
    expect(en.shiftDetail.liveTitel).toBe("Your job is live");
    expect(Object.keys(nl.shiftDetail)).not.toContain("controleTitel");
    expect(Object.keys(en.shiftDetail)).not.toContain("controleTitel");
  });

  it("het startscherm heeft geen waarschuwing over verifiëren of een limiet van één klus meer", () => {
    for (const w of [nl.werkgeverStart, en.werkgeverStart]) {
      for (const oud of ["controleTitel", "nietGeverifieerd", "eenKlusVoor", "eenKlusVet", "eenKlusNa", "kvkNodig", "stapTitel", "stapWhy"]) {
        expect(Object.keys(w), oud).not.toContain(oud);
      }
      expect(w.controleAangevraagd.length).toBeGreaterThan(20);
    }
    for (const o of [nl.onboarding, en.onboarding]) {
      for (const oud of ["kvkNumber", "kvkInControle", "kvkInControleForeign", "country", "vatNumber", "regNumber", "verifyNext"]) {
        expect(Object.keys(o), oud).not.toContain(oud);
      }
    }
  });

  it("de pagina's halen hun tekst uit het woordenboek, geen vaste zin met het woord erin", () => {
    const klus = readFileSync(path.join(ROOT, "app/werkgever/diensten/[shiftId]/page.tsx"), "utf8");
    for (const sleutel of ["d.liveTitel", "d.liveTekst", "d.bewaardTitel", "d.bewaardTekst", "d.conceptTitel", "d.queueResponded"]) expect(klus).toContain(sleutel);
    const start = readFileSync(path.join(ROOT, "app/werkgever/page.tsx"), "utf8");
    expect(start).toContain("ws.controleAangevraagd");
    expect(start).not.toMatch(/border-warn\/40/);
  });
});
