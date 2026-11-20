import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LATER_ANKERS, laterBlokTonen, stapStaatElders } from "@/lib/onboarding/later-blok";
import { KLUS_STUK_HREF } from "@/lib/onboarding/klaar-voor-klus";
import type { WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// 20 nov 2026: het scherm van een nieuwe werker was te lang en te vol. (a) In de startstappen bovenaan Ontdekken is een
// stap die nog niet aan de beurt is één compacte regel. (b) Op Verificatie komt het blok "Voor je eerste klus" (BSN,
// overeenkomst, rekeningnummer) pas als de vijf stappen af zijn; tot dan één regel, en de ankers blijven werken.

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const af: WerkerPoortFeiten = { soortGekozen: true, branchesGekozen: true, gegevensIngevuld: true, identiteitIngestuurd: true, werkrechtIngevuld: true, tweestapAan: true, fotoGezet: true };

describe("het blok 'Voor je eerste klus' pas na de vijf stappen", () => {
  it("verborgen zolang een van de vijf stappen open staat, zichtbaar als ze af zijn", () => {
    expect(laterBlokTonen(af)).toBe(true);
    expect(laterBlokTonen({ ...af, soortGekozen: false })).toBe(false);
    expect(laterBlokTonen({ ...af, branchesGekozen: false })).toBe(false);
    expect(laterBlokTonen({ ...af, gegevensIngevuld: false })).toBe(false);
    expect(laterBlokTonen({ ...af, identiteitIngestuurd: false })).toBe(false);
    expect(laterBlokTonen({ ...af, fotoGezet: false })).toBe(false);
  });

  it("wat niet bij de vijf stappen hoort (werkrecht, tweestaps) houdt het blok niet verborgen; een storing ook niet", () => {
    expect(laterBlokTonen({ ...af, werkrechtIngevuld: false, tweestapAan: false })).toBe(true);
    expect(laterBlokTonen(null)).toBe(true);
  });

  it("de knop naar de stappen alleen als de eerstvolgende stap niet in het formulier van Verificatie staat", () => {
    expect(stapStaatElders({ ...af, fotoGezet: false })).toBe(true);
    expect(stapStaatElders({ ...af, branchesGekozen: false })).toBe(true);
    expect(stapStaatElders({ ...af, soortGekozen: false, gegevensIngevuld: false })).toBe(true);
    expect(stapStaatElders({ ...af, gegevensIngevuld: false, fotoGezet: false })).toBe(false);
    expect(stapStaatElders({ ...af, identiteitIngestuurd: false })).toBe(false);
    expect(stapStaatElders(af)).toBe(false);
    expect(stapStaatElders(null)).toBe(false);
  });

  it("elke link van buiten (mail, push, Ontdekken) heeft een anker bij de regel 'dit komt daarna'", () => {
    const ankers: readonly string[] = LATER_ANKERS;
    for (const href of Object.values(KLUS_STUK_HREF)) {
      if (!href) continue;
      expect(ankers, href).toContain(href.split("#")[1] ?? "");
    }
    // de andere plekken die naar een anker op Verificatie linken, als bron gelezen (herinneringen, meldingen, mail, schermen)
    const overige = ["lib/onboarding/herinnering-teksten.ts", "lib/onboarding/laat-weten.ts", "lib/agreements/uitzend-melding.ts", "lib/mail/werker/uitzend-bijgewerkt.ts", "components/app/FiscalForm.tsx", "components/app/WerkerStartWizard.tsx"];
    for (const f of overige) {
      for (const m of lees(f).matchAll(/\/dashboard\/verificatie#([a-z-]+)/g)) expect(ankers, `${f} #${m[1] ?? ""}`).toContain(m[1] ?? "");
    }
  });

  it("de pagina: de regel met de ankers als het blok verborgen is, anders het blok zelf", () => {
    const pagina = lees("app/dashboard/verificatie/page.tsx");
    // wie al gewerkt heeft of iets gepland heeft, houdt het blok (verlopen ID, links uit mail naar de ankers)
    expect(pagina).toContain("const laterTonen = laterBlokTonen(poort) || o.shiftsCompleted > 0 || o.kpis.upcoming > 0;");
    expect(pagina).toContain('{!laterTonen && LATER_ANKERS.map((anker) => <span key={anker} id={anker} className="block scroll-mt-20" />)}');
    const regel = pagina.indexOf("{!laterTonen ? (");
    const blok = pagina.indexOf("<p className=\"mt-1 text-sm text-neutralx-500\">{pt.laterUitleg}</p>");
    expect(regel).toBeGreaterThan(pagina.indexOf('aria-labelledby="later-kop"'));
    expect(pagina.indexOf("{fd.klaarVoorKlus.daarna}", regel)).toBeGreaterThan(regel);
    expect(pagina.indexOf("{fd.klaarVoorKlus.daarna}", regel)).toBeLessThan(blok);
    // het blok zelf (met zijn echte ankers) staat alleen in de andere tak
    for (const stuk of ['id="bankrekening"', 'id="werkrecht"', 'id="uitzendovereenkomst" tabIndex={-1}', 'kopId="gegevens-later-kop" soort={fiscal.workerKind ?? null}']) {
      expect(pagina.indexOf(stuk, blok), stuk).toBeGreaterThan(blok);
    }
    // de regels van de poort zelf zijn niet aangeraakt: het hulpje leest ze alleen
    const hulp = lees("lib/onboarding/later-blok.ts");
    expect(hulp).toContain("werkerOnboardingKlaar(poort)");
    expect(hulp).not.toMatch(/prisma|storage\/kv/);
  });

  it("de regel en de knop in vijf talen", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      expect(d.klaarVoorKlus.daarna.length, taal).toBeGreaterThan(20);
      expect(d.klaarVoorKlus.daarnaKnop.length, taal).toBeGreaterThan(5);
      if (taal !== "nl") {
        expect(d.klaarVoorKlus.daarna, taal).not.toBe(FREELANCER_DICTS.nl.klaarVoorKlus.daarna);
        expect(d.klaarVoorKlus.daarnaKnop, taal).not.toBe(FREELANCER_DICTS.nl.klaarVoorKlus.daarnaKnop);
      }
    }
  });
});

describe("de startstappen: wat nog komt is één compacte regel", () => {
  const s = lees("components/app/WerkerStartWizard.tsx");
  it("een stap die nog niet aan de beurt is heeft geen kaart, geen uitleg en geen 'Rond eerst de stap hierboven af'", () => {
    expect(s).toContain('const uitgeschakeld = stand === "volgende";');
    expect(s).toContain('? "min-w-0 flex-1 pt-2"');
    expect(s).toContain('{stand === "actief" && k !== "kind" && k !== "branches" && <p');
    expect(s).not.toContain("{t.eerstDit}");
    expect(s).not.toContain(': "border-hair bg-paper-soft"');
  });
  it("de afgeronde en de actieve stap houden hun kaart, en het nummer en de titel blijven staan", () => {
    expect(s).toContain('`min-w-0 flex-1 rounded-xl border p-4 ${stand === "actief" ? "border-brand-500/40 bg-white shadow-sm" : "border-hair bg-white"}`');
    expect(s).toContain('{stand === "klaar" ? "✓" : i + 1}');
    expect(s).toContain('<span className="flex-1">{label[k]}</span>');
    expect(s).toContain('aria-current={stand === "actief" ? "step" : undefined}');
  });
});
