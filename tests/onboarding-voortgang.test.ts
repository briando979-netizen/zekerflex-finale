import { describe, expect, it } from "vitest";
import {
  berekenVoortgang,
  herinneringInhoud,
  herinneringReden,
  werkerStappen,
  startKlaar,
  werkgeverStappen,
  type WerkerFeiten,
  type WerkgeverFeiten,
} from "@/lib/onboarding/voortgang";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { WERKGEVER_KAART, WERKGEVER_KAART_EN, WERKGEVER_STAPPEN, WERKGEVER_STAPPEN_EN, werkgeverKaartTeksten } from "@/lib/onboarding/werkgever-teksten";

const leeg: WerkerFeiten = {
  emailBevestigd: false,
  fiscaalKlaar: false,
  uitzend: false,
  kvkOfBtw: false,
  contractGetekend: false,
  identiteitGeverifieerd: false,
  bankEnThuis: false,
  heeftPush: false,
};
const alles: WerkerFeiten = {
  ...leeg,
  emailBevestigd: true,
  fiscaalKlaar: true,
  kvkOfBtw: true,
  identiteitGeverifieerd: true,
  bankEnThuis: true,
};

describe("werker-voortgang", () => {
  it("nieuwe werker: niets klaar, eerstvolgende stap is e-mail", () => {
    const v = berekenVoortgang(werkerStappen(leeg));
    expect(v.done).toBe(0);
    expect(v.total).toBe(5); // push is een tip en telt niet mee
    expect(v.pct).toBe(0);
    expect(v.volgende?.key).toBe("email");
    expect(v.klaar).toBe(false);
  });

  it("uitzendkracht krijgt een contractstap, geen KVK-stap", () => {
    const keys = werkerStappen({ ...leeg, uitzend: true }).map((s) => s.key);
    expect(keys).toContain("contract");
    expect(keys).not.toContain("kvk");
    expect(werkerStappen(leeg).map((s) => s.key)).toContain("kvk");
  });

  it("alles klaar: niets meer open, en geen meldingen-tip", () => {
    const v = berekenVoortgang(werkerStappen(alles));
    expect(v.klaar).toBe(true);
    expect(v.pct).toBe(100);
    expect(v.minutenOpen).toBe(0);
    expect(v.open).toEqual([]);
    expect(v.volgende).toBeNull();
    expect(werkerStappen(alles).map((s) => s.key)).not.toContain("push");
  });

  it("minuten tellen alleen open verplichte stappen", () => {
    const v = berekenVoortgang(werkerStappen({ ...leeg, emailBevestigd: true, fiscaalKlaar: true }));
    expect(v.minutenOpen).toBe(3 + 4 + 2);
    expect(v.done).toBe(2);
    expect(v.pct).toBe(40);
  });
});

// "Jouw start" (23 nov 2026): twee blokken en geen KVK-stap. Blok 1 "Jij en je bedrijf": organisatie, adres, profiel, e-mail.
// Blok 2 "Jouw eerste klus": klus plaatsen, reacties bekijken, een freelancer kiezen, afronden.
describe("werkgever-voortgang", () => {
  const leegBedrijf: WerkgeverFeiten = {
    orgBeantwoord: false,
    adresKlaar: false,
    profielKlaar: false,
    emailBevestigd: false,
    heeftKlus: false,
    heeftReactie: false,
    heeftIngepland: false,
  };
  const blok1: WerkgeverFeiten = { ...leegBedrijf, orgBeantwoord: true, adresKlaar: true, profielKlaar: true, emailBevestigd: true };

  it("een nieuw bedrijf: acht stappen in twee blokken, geen stap voor KVK of verificatie", () => {
    const stappen = werkgeverStappen(leegBedrijf);
    expect(stappen.map((s) => `${s.blok}:${s.key}`)).toEqual(["1:org", "1:adres", "1:profiel", "1:email", "2:klus", "2:reacties", "2:kiezen", "2:afronden"]);
    expect(stappen.map((s) => s.key).join(" ")).not.toMatch(/kvk|verificatie|bedrijf/);
    const v = berekenVoortgang(stappen);
    expect(v.total).toBe(8);
    expect(v.done).toBe(0);
    expect(v.volgende?.key).toBe("org");
  });

  it("blok 1 klaar: de volgende stap is de eerste klus, en die kost de meeste minuten", () => {
    const v = berekenVoortgang(werkgeverStappen(blok1));
    expect(v.volgende?.key).toBe("klus");
    expect(v.done).toBe(4);
    // reacties wachten op werkers: daar valt voor het bedrijf niets te doen, dus geen minuten
    expect(v.minutenOpen).toBe(5 + 1);
  });

  it("een bedrijf kan meteen een klus plaatsen: de klus telt zonder dat het KVK-nummer of een controle nodig is", () => {
    const stappen = werkgeverStappen({ ...leegBedrijf, heeftKlus: true });
    expect(stappen.find((s) => s.key === "klus")?.done).toBe(true);
    expect(stappen.find((s) => s.key === "afronden")?.done).toBe(false);
  });

  it("afronden telt pas als blok 1 klaar is én er iemand is ingepland", () => {
    const klaarVoorKiezen = { ...blok1, heeftKlus: true, heeftReactie: true };
    expect(werkgeverStappen({ ...klaarVoorKiezen, heeftIngepland: true }).find((s) => s.key === "afronden")?.done).toBe(true);
    expect(werkgeverStappen({ ...klaarVoorKiezen, heeftIngepland: true, adresKlaar: false }).find((s) => s.key === "afronden")?.done).toBe(false);
    expect(berekenVoortgang(werkgeverStappen({ ...klaarVoorKiezen, heeftIngepland: true })).open).toEqual([]);
  });

  it("de grote checklist sluit pas als blok 1 klaar is en de eerste klus er staat", () => {
    expect(startKlaar(leegBedrijf)).toBe(false);
    expect(startKlaar(blok1)).toBe(false);
    expect(startKlaar({ ...blok1, heeftKlus: true })).toBe(true);
    expect(startKlaar({ ...blok1, heeftKlus: true, emailBevestigd: false })).toBe(false);
  });

  it("na de checklist toont de kaart alleen blok 2: wat er van de eerste klus nog open staat", () => {
    const v = berekenVoortgang(werkgeverStappen({ ...blok1, heeftKlus: true }).filter((s) => s.blok === 2));
    expect(v.open.map((s) => s.key)).toEqual(["reacties", "kiezen", "afronden"]);
    expect(v.volgende?.key).toBe("reacties");
  });

  it("elke stap heeft tekst in het Nederlands en het Engels", () => {
    for (const s of werkgeverStappen(leegBedrijf)) {
      for (const teksten of [WERKGEVER_STAPPEN, WERKGEVER_STAPPEN_EN]) {
        expect(teksten[s.key].title.length, s.key).toBeGreaterThan(3);
        expect(teksten[s.key].why.length, s.key).toBeGreaterThan(10);
      }
      expect(WERKGEVER_STAPPEN_EN[s.key].title, s.key).not.toBe(WERKGEVER_STAPPEN[s.key].title);
    }
    expect(werkgeverKaartTeksten("en").kaart).toBe(WERKGEVER_KAART_EN);
    expect(werkgeverKaartTeksten("nl").kaart).toBe(WERKGEVER_KAART);
    expect(werkgeverKaartTeksten("xx").stappen).toBe(WERKGEVER_STAPPEN);
  });
});

describe("herinneringReden", () => {
  it("onbevestigde e-mail gaat voor alles", () => {
    expect(herinneringReden({ rol: "werker", emailBevestigd: false })).toBe("email");
    expect(herinneringReden({ rol: "bedrijf", emailBevestigd: false })).toBe("email");
  });
  it("werker: profiel ontbreekt, daarna alleen identiteit, daarna niets", () => {
    expect(herinneringReden({ rol: "werker", emailBevestigd: true, heeftProfiel: false, kycVerified: false })).toBe("werker-profiel");
    expect(herinneringReden({ rol: "werker", emailBevestigd: true, heeftProfiel: true, kycVerified: false })).toBe("werker-verificatie");
    expect(herinneringReden({ rol: "werker", emailBevestigd: true, heeftProfiel: true, kycVerified: true })).toBeNull();
  });
  it("bedrijf: eerst het adres, dan de eerste klus, dan niets; nooit een herinnering om een KVK-nummer in te vullen", () => {
    const b = { rol: "bedrijf" as const, emailBevestigd: true };
    expect(herinneringReden({ ...b, adresKlaar: false })).toBe("bedrijf-adres");
    expect(herinneringReden({ ...b, adresKlaar: true, heeftKlus: false })).toBe("bedrijf-klus");
    expect(herinneringReden({ ...b, adresKlaar: true, heeftKlus: true })).toBeNull();
    // een bedrijf hoeft vóór het plaatsen niet gecontroleerd te zijn: de oude redenen bestaan niet meer
    for (const adres of [false, true]) {
      for (const klus of [false, true]) {
        const r = herinneringReden({ ...b, adresKlaar: adres, heeftKlus: klus });
        expect(r === null || r === "bedrijf-adres" || r === "bedrijf-klus").toBe(true);
      }
    }
  });
  it("elke reden heeft inhoud met een pad vanaf de root", () => {
    for (const r of ["werker-profiel", "werker-verificatie", "bedrijf-adres", "bedrijf-klus"] as const) {
      const i = herinneringInhoud(r);
      expect(i.href.startsWith("/")).toBe(true);
      expect(i.todo.length).toBeGreaterThan(5);
    }
  });
  it("de herinneringen aan een bedrijf noemen geen KVK, geen verificatie en geen limiet van een klus", () => {
    for (const r of ["bedrijf-adres", "bedrijf-klus"] as const) {
      const i = herinneringInhoud(r);
      expect(`${i.todo} ${i.why}`, r).not.toMatch(/KVK|verifi|één klus|test/i);
    }
    expect(herinneringInhoud("bedrijf-klus").why).toContain("meteen live");
  });
});

describe("profielAf i18n", () => {
  const sleutels = werkerStappen(leeg).map((s) => s.key);
  it("alle stappen en teksten staan in alle vijf talen", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      const p = d.profielAf;
      for (const k of sleutels) {
        expect(p.steps[k].title.length, `${taal}.${k}.title`).toBeGreaterThan(2);
        expect(p.steps[k].why.length, `${taal}.${k}.why`).toBeGreaterThan(5);
      }
      for (const v of Object.values(p.klaar)) expect(v.length, taal).toBeGreaterThan(1);
      expect(p.sub(2, 5, 7)).toMatch(/2/);
      expect(p.sub(2, 5, 7)).toMatch(/7/);
      expect(p.stepOf(1, 5)).toMatch(/5/);
    }
  });
});
