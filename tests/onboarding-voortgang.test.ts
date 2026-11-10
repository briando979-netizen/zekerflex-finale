import { describe, expect, it } from "vitest";
import {
  berekenVoortgang,
  herinneringInhoud,
  herinneringReden,
  werkerStappen,
  werkgeverStappen,
  type WerkerFeiten,
} from "@/lib/onboarding/voortgang";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { WERKGEVER_STAPPEN } from "@/lib/onboarding/werkgever-teksten";

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

describe("werkgever-voortgang", () => {
  const f = { emailBevestigd: true, bedrijfKlaar: true, verified: true, inControle: false, heeftKlus: false };

  it("geverifieerd bedrijf zonder klus: volgende stap is de eerste klus", () => {
    const v = berekenVoortgang(werkgeverStappen(f));
    expect(v.volgende?.key).toBe("klus");
    expect(v.done).toBe(3);
  });

  it("onbevestigde e-mail komt eerst", () => {
    expect(berekenVoortgang(werkgeverStappen({ ...f, emailBevestigd: false })).volgende?.key).toBe("email");
  });

  it("handmatige controle: wachten staat achteraan, volgende is een klus", () => {
    const v = berekenVoortgang(werkgeverStappen({ ...f, verified: false, inControle: true }));
    expect(v.volgende?.key).toBe("klus");
    expect(v.open.map((s) => s.key)).toEqual(["klus", "verificatie"]);
  });

  it("alles klaar: kaart verdwijnt", () => {
    expect(berekenVoortgang(werkgeverStappen({ ...f, heeftKlus: true })).open).toEqual([]);
  });

  it("elke stap heeft Nederlandse tekst", () => {
    for (const s of werkgeverStappen(f)) expect(WERKGEVER_STAPPEN[s.key].title.length).toBeGreaterThan(3);
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
  it("bedrijf: gegevens, verificatie, klus, niets", () => {
    const b = { rol: "bedrijf" as const, emailBevestigd: true };
    expect(herinneringReden({ ...b, bedrijfKlaar: false })).toBe("bedrijf-gegevens");
    expect(herinneringReden({ ...b, bedrijfKlaar: true, verified: false })).toBe("bedrijf-verificatie");
    expect(herinneringReden({ ...b, bedrijfKlaar: true, verified: false, inControle: true })).toBeNull();
    expect(herinneringReden({ ...b, bedrijfKlaar: true, verified: true, heeftKlus: false })).toBe("bedrijf-klus");
    expect(herinneringReden({ ...b, bedrijfKlaar: true, verified: true, heeftKlus: true })).toBeNull();
  });
  it("elke reden heeft inhoud met een pad vanaf de root", () => {
    for (const r of ["werker-profiel", "werker-verificatie", "bedrijf-gegevens", "bedrijf-verificatie", "bedrijf-klus"] as const) {
      const i = herinneringInhoud(r);
      expect(i.href.startsWith("/")).toBe(true);
      expect(i.todo.length).toBeGreaterThan(5);
    }
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
