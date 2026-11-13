import { describe, expect, it } from "vitest";
import { aantalOpen, nogStappenTekst, reageerStap, reageerStapHref, stapVanTotaal, TIJDLIJN_VOLGORDE, tijdlijnStappen, volgendeStap, type TijdlijnKlaar } from "@/lib/onboarding/laat-weten";
import { openVerplicht, POORT_STAPPEN, werkerOnboardingKlaar, type WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

const alles: TijdlijnKlaar = { kind: true, branches: true, email: true, gegevens: true, identiteit: true, foto: true, werkrecht: true, tweestap: true };

describe("tijdlijn van de werker-start", () => {
  it("telt open stappen en kiest de eerste als actief", () => {
    const k = { ...alles, identiteit: false, foto: false };
    expect(aantalOpen(k)).toBe(2);
    expect(volgendeStap(k)).toBe("identiteit");
    expect(tijdlijnStappen(k).map((s) => s.stand)).toEqual(["klaar", "klaar", "klaar", "actief", "volgende"]);
  });
  it("gegevens en ID-check zijn twee aparte stappen, in die volgorde", () => {
    // het recht om te werken zit sinds 10 nov niet meer in de start, tweestapsverificatie sinds 12 nov niet (optioneel)
    expect(TIJDLIJN_VOLGORDE).toEqual(["kind", "branches", "gegevens", "identiteit", "foto"]);
    const k = { ...alles, gegevens: false, identiteit: false };
    expect(tijdlijnStappen(k).map((s) => s.stand)).toEqual(["klaar", "klaar", "actief", "volgende", "klaar"]);
    // tweestap uit telt niet als open stap
    expect(aantalOpen({ ...alles, tweestap: false })).toBe(0);
    expect(volgendeStap({ ...alles, identiteit: false })).toBe("identiteit");
  });
  it("alles klaar: geen volgende stap", () => {
    expect(aantalOpen(alles)).toBe(0);
    expect(volgendeStap(alles)).toBeNull();
    expect(tijdlijnStappen(alles).every((s) => s.stand === "klaar")).toBe(true);
  });
  it("een eerdere open stap blijft de actieve", () => {
    expect(volgendeStap({ ...alles, kind: false })).toBe("kind");
  });
});

describe("één teller: de tijdlijn is de poort (13 nov)", () => {
  const leeg: WerkerPoortFeiten = { soortGekozen: false, branchesGekozen: false, gegevensIngevuld: false, identiteitIngestuurd: false, werkrechtIngevuld: false, tweestapAan: false, fotoGezet: false };

  it("de stappen van de tijdlijn zijn die van de poort, in dezelfde volgorde, en het zijn er vijf", () => {
    expect(TIJDLIJN_VOLGORDE).toEqual(POORT_STAPPEN.map((s) => s.sleutel));
    expect(TIJDLIJN_VOLGORDE).toHaveLength(5);
    expect(openVerplicht(leeg)).toBe(TIJDLIJN_VOLGORDE.length);
  });

  it("de poort is klaar precies als alle stappen van de tijdlijn klaar zijn", () => {
    const feiten = (n: number): WerkerPoortFeiten => {
      const f = { ...leeg };
      for (const s of POORT_STAPPEN.slice(0, n)) f[s.feit] = true;
      return f;
    };
    for (let n = 0; n <= POORT_STAPPEN.length; n++) {
      const klaar = Object.fromEntries(TIJDLIJN_VOLGORDE.map((k, i) => [k, i < n])) as Partial<TijdlijnKlaar>;
      const k: TijdlijnKlaar = { ...alles, ...klaar };
      expect(aantalOpen(k), `n=${n}`).toBe(openVerplicht(feiten(n)));
      expect(werkerOnboardingKlaar(feiten(n)), `n=${n}`).toBe(volgendeStap(k) === null);
    }
  });

  it("e-mail bevestigen, werkrecht en tweestap zijn geen stap: ze veranderen de teller niet", () => {
    expect(aantalOpen({ ...alles, email: false, werkrecht: false, tweestap: false })).toBe(0);
    expect(stapVanTotaal({ ...alles, email: false })).toBeNull();
  });

  it("stapVanTotaal: het nummer van de eerste open stap, van vijf", () => {
    expect(stapVanTotaal({ ...alles, gegevens: false, identiteit: false })).toEqual({ n: 3, totaal: 5, sleutel: "gegevens" });
    expect(stapVanTotaal({ ...alles, kind: false })).toEqual({ n: 1, totaal: 5, sleutel: "kind" });
    expect(stapVanTotaal({ ...alles, foto: false })).toEqual({ n: 5, totaal: 5, sleutel: "foto" });
    expect(stapVanTotaal(alles)).toBeNull();
  });
});

describe("reageerStap", () => {
  it("herkent de reden van de server", () => {
    expect(reageerStap("Je kunt pas aannemen als je identiteit is geverifieerd.")).toBe("identiteit");
    expect(reageerStap("Rond eerst je verificatie af om diensten aan te nemen.")).toBe("identiteit");
    expect(reageerStap("Rond je uitzend-gegevens af (BSN en rekeningnummer) om op klussen te reageren.")).toBe("gegevens");
    expect(reageerStap("Je hebt nog geen bewijs van je recht om te werken in Nederland.")).toBe("werkrecht");
    expect(reageerStap("Je account kan momenteel geen diensten aannemen.")).toBe("anders");
    expect(reageerStap(null)).toBe("anders");
    expect(reageerStapHref("werkrecht")).toContain("#werkrecht");
  });
});

describe("meervoud per taal (12 nov: \"Zostało tylko 4 kroków\" is fout Pools)", () => {
  it("Pools en Oekraïens: 2-4 een eigen vorm, 5 en meer de gewone", () => {
    const pl = FREELANCER_DICTS.pl.start;
    expect(nogStappenTekst(4, pl, FREELANCER_DICTS.pl.intl)).toBe("Zostały tylko 4 kroki!");
    expect(nogStappenTekst(5, pl, FREELANCER_DICTS.pl.intl)).toBe("Zostało tylko 5 kroków!");
    expect(nogStappenTekst(22, pl, FREELANCER_DICTS.pl.intl)).toBe("Zostały tylko 22 kroki!");
    const uk = FREELANCER_DICTS.uk.start;
    expect(nogStappenTekst(3, uk, FREELANCER_DICTS.uk.intl)).toBe("Залишилося лише 3 кроки!");
    expect(nogStappenTekst(6, uk, FREELANCER_DICTS.uk.intl)).toBe("Залишилося лише 6 кроків!");
  });
  it("Nederlands en een onbekende taalcode: gewoon meervoud", () => {
    const nl = FREELANCER_DICTS.nl.start;
    expect(nogStappenTekst(3, nl, "nl-NL")).toBe("Nog maar 3 stappen te gaan!");
    expect(nogStappenTekst(3, FREELANCER_DICTS.pl.start, "xx-onzin-taal-123")).toBe("Zostało tylko 3 kroków!");
  });
});

describe("teksten in vijf talen", () => {
  for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
    it(`${taal}: tijdlijn, locatie en reageer-sheet compleet`, () => {
      const t = d.start;
      expect(nogStappenTekst(3, t)).toContain("3");
      expect(nogStappenTekst(1, t)).not.toContain("{n}");
      expect(nogStappenTekst(0, t)).toBe(t.alleKlaar);
      for (const s of [t.gegevensStep, t.gegevensBody, t.gegevensCta, t.identiteitStep, t.identiteitBody, t.identiteitCta, t.laatWeten, t.sluiten, t.afsluiting, t.klaarLabel, t.eerstDit, t.wijzig, t.richtingVast, t.naarFiscaal, t.gegevensUitzend, t.gegevensZzp, t.gegevensFlex]) expect(s.length).toBeGreaterThan(1);
      // de gegevens-stap noemt per soort wat er echt nodig is (12 nov): een uitzendkracht het BSN
      expect(t.gegevensUitzend).toMatch(/BSN/);
      expect(t.gegevensZzp).toMatch(/KVK/);
      expect(t.gegevensFlex).toMatch(/KOR/);
      expect(t.nogMeerFew).toContain("{n}");
      // één teller "stap n van 5" en de namen van stap 3 en 4 (13 nov)
      expect(t.stapVan).toContain("{n}");
      expect(t.stapVan).toContain("{totaal}");
      expect(t.gegevensStep.length).toBeGreaterThan(2);
      expect(t.identiteitStep.length).toBeGreaterThan(2);
      for (const s of Object.values(d.loc)) expect(String(s).length).toBeGreaterThan(1);
      for (const s of Object.values(d.reageerBlok)) expect(String(s).length).toBeGreaterThan(1);
    });
  }
});
