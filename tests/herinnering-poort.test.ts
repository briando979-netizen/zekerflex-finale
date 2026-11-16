import { describe, expect, it } from "vitest";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { onboardingReminderEmail } from "@/lib/mail";
import { HERINNERING_TEKSTEN, MIST_HREF, MIST_POORT, herinneringHref, herinneringMist, stapUitMist, werkerHerinnering, type MistStuk } from "@/lib/onboarding/herinnering-teksten";
import { volgendeStapHref } from "@/lib/onboarding/volgende-stap";
import { POORT_STAPPEN, poortStapVan, type WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";

// De herinnering aan een werker volgt de poort (13 nov): de link gaat naar de eerste open poortstap, dezelfde plek als het eindscherm van de
// ID-scan (volgendeStapHref), en de tekst noemt "Stap n van 5: <naam>" in de app-taal van de werker.

const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;
const leeg: WerkerPoortFeiten = { soortGekozen: false, branchesGekozen: false, gegevensIngevuld: false, identiteitIngestuurd: false, werkrechtIngevuld: false, tweestapAan: false, fotoGezet: false };

/** Alle 32 combinaties van de vijf poortfeiten. */
function combinaties(): WerkerPoortFeiten[] {
  const uit: WerkerPoortFeiten[] = [];
  for (let m = 0; m < 1 << POORT_STAPPEN.length; m++) {
    const f = { ...leeg };
    POORT_STAPPEN.forEach((s, i) => {
      f[s.feit] = Boolean(m & (1 << i));
    });
    uit.push(f);
  }
  return uit;
}

const gegevens = (f: WerkerPoortFeiten) =>
  f.soortGekozen && !f.gegevensIngevuld ? { soort: "uitzendkracht" as const, fiscaalIngevuld: false, contractGetekend: false, bedrijfOk: false, postcodeOk: false } : null;
const mistVan = (f: WerkerPoortFeiten): MistStuk[] =>
  herinneringMist({ soortGekozen: f.soortGekozen, branchesGekozen: f.branchesGekozen, identiteitIngestuurd: f.identiteitIngestuurd, fotoGezet: f.fotoGezet, gegevens: gegevens(f) });

describe("de herinnering en de poort tellen hetzelfde", () => {
  it("de eerste ontbrekende stap van de herinnering is poortStapVan, voor elke combinatie van de poortfeiten", () => {
    for (const f of combinaties()) {
      const mist = mistVan(f);
      const poort = poortStapVan(f);
      // een soort die gekozen is zonder dat er iets in "gegevens" mist (de stand van de poort zegt wel open) valt buiten deze regels: alleen vergelijken waar de gegevens echt mist
      if (poort?.sleutel === "gegevens" && mist.length === 0) continue;
      expect(stapUitMist(mist), JSON.stringify(f)).toEqual(poort);
    }
  });

  it("elk onderdeel hoort bij een stap van de poort, of (null) bij vóór de eerste klus", () => {
    const sleutels = new Set<string>(POORT_STAPPEN.map((s) => s.sleutel));
    for (const stuk of Object.keys(MIST_POORT) as MistStuk[]) {
      const p = MIST_POORT[stuk];
      if (p !== null) expect(sleutels.has(p), stuk).toBe(true);
    }
    // sinds 13 nov niet meer bij de aanmelding, maar vóór de eerste klus (16 nov ook in de herinnering)
    for (const stuk of ["bsn", "contract", "btw", "iban", "werkrecht"] as const) expect(MIST_POORT[stuk], stuk).toBeNull();
  });
});

describe("de link volgt dezelfde plek als het eindscherm van de ID-scan", () => {
  it("gegevens, foto, richting en branches: volgendeStapHref; de ID zelf: Verificatie", () => {
    for (const s of POORT_STAPPEN) {
      if (s.sleutel === "identiteit") expect(herinneringHref(s.sleutel)).toBe("/dashboard/verificatie");
      else expect(herinneringHref(s.sleutel), s.sleutel).toBe(volgendeStapHref(s.sleutel));
    }
    expect(MIST_HREF.postcode).toBe(volgendeStapHref("gegevens"));
    expect(MIST_HREF.foto).toBe(volgendeStapHref("foto"));
    // vóór de eerste klus: dezelfde plekken als de kaart "Klaar voor je eerste klus"
    expect(MIST_HREF.bsn).toBe("/dashboard/verificatie#gegevens-later-kop");
    expect(MIST_HREF.contract).toBe("/dashboard/verificatie#uitzendovereenkomst");
    expect(MIST_HREF.iban).toBe("/dashboard/verificatie#bankrekening");
  });
});

describe("de tekst noemt 'Stap n van 5: <naam>' in de taal van de werker", () => {
  it("per taal: de regel in mail en push, de knop en de push gaan naar de eerste open stap", () => {
    const mist: MistStuk[] = ["postcode", "identiteit", "foto"];
    for (const taal of TALEN) {
      const t = HERINNERING_TEKSTEN[taal];
      const start = FREELANCER_DICTS[taal].start;
      const h = werkerHerinnering(mist, t, "Anna", 1, taal);
      const regel = `${start.stapVan.replace("{n}", "3").replace("{totaal}", "5")}: ${start.gegevensStep}`;
      expect(h.stapRegel, taal).toBe(regel);
      expect(h.pushBody, taal).toContain(regel);
      expect(h.knopHref, taal).toBe(volgendeStapHref("gegevens"));
      const mail = onboardingReminderEmail("Anna Kowalska", "uitzendkracht", "https://zf.test/", 1, undefined, h);
      expect(mail.text, taal).toContain(regel);
      expect(mail.html, taal).toContain(regel);
      expect(mail.html, taal).toContain(`href="https://zf.test${volgendeStapHref("gegevens")}"`);
    }
  });

  it("na de aanmelding (alleen stukken vóór de eerste klus): geen 'Stap n van 5', de knop naar het eerste stuk (16 nov)", () => {
    const mist: MistStuk[] = ["bsn", "contract", "iban"];
    for (const taal of TALEN) {
      const h = werkerHerinnering(mist, HERINNERING_TEKSTEN[taal], "Anna", 2, taal);
      expect(h.stapRegel, taal).toBeNull();
      expect(h.knopHref, taal).toBe("/dashboard/verificatie#gegevens-later-kop");
      expect(h.items.map((i) => i.href), taal).toEqual(["/dashboard/verificatie#gegevens-later-kop", "/dashboard/verificatie#uitzendovereenkomst", "/dashboard/verificatie#bankrekening"]);
      for (const i of h.items) expect(i.tekst.length, taal).toBeGreaterThan(5);
    }
  });

  it("NL: een werker die alleen de foto nog mist krijgt 'Stap 5 van 5: Profielfoto' en de fotolink", () => {
    const h = werkerHerinnering(["foto"], HERINNERING_TEKSTEN.nl, "Anna", 1, "nl");
    expect(h.stapRegel).toBe("Stap 5 van 5: Profielfoto");
    expect(h.knopHref).toBe("/dashboard/eerste-indruk?stap=foto");
    expect(h.pushBody).toBe("Stap 5 van 5: Profielfoto. Nog te doen: zet een profielfoto.");
  });

  it("NL: wie nog geen ID-scan deed gaat naar Verificatie, en de regel zegt 'Je ID'", () => {
    const h = werkerHerinnering(["identiteit", "foto"], HERINNERING_TEKSTEN.nl, "Anna", 1, "nl");
    expect(h.stapRegel).toBe("Stap 4 van 5: Je ID");
    expect(h.knopHref).toBe("/dashboard/verificatie");
  });

  it("zonder open stap (niets te herinneren) geen regel en geen eigen knoplink", () => {
    const h = werkerHerinnering([], HERINNERING_TEKSTEN.nl, "Anna", 1, "nl");
    expect(h.stapRegel).toBeNull();
    expect(h.knopHref).toBeNull();
  });
});
