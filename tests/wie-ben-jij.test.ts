import { describe, expect, it } from "vitest";
import {
  LANDNUMMERS,
  beginStap,
  controleerGeboortedatum,
  controleerPersoon,
  isMeerderjarig,
  leesDatum,
  splitNaam,
  splitTelefoon,
  stappenVoor,
  telefoonNaarE164,
  voegNaam,
} from "@/lib/onboarding/wie-ben-jij";
import {
  OPLEIDING_NIVEAUS,
  OPLEIDING_RICHTINGEN,
  NIVEAU_LABELS,
  RICHTING_LABELS,
  filterRichtingen,
  heeftRichting,
  schoonOpleiding,
} from "@/lib/onboarding/opleiding";
import { WIE_TEKSTEN } from "@/lib/i18n/wie-ben-jij";
import { SCAN_EXTRA } from "@/lib/i18n/scan-extra";
import { LOCALES } from "@/lib/i18n/config";

// De klok staat vast (12 november 2026, middag Nederlandse tijd): geen tijdbom in UTC.
const NU = new Date("2026-11-12T12:00:00+01:00");

describe("naam splitsen en samenvoegen", () => {
  it("houdt tussenvoegsels bij de achternaam", () => {
    expect(splitNaam("Jan van Essen")).toEqual({ voornaam: "Jan", achternaam: "van Essen" });
    expect(splitNaam("Anna Maria van der Berg")).toEqual({ voornaam: "Anna Maria", achternaam: "van der Berg" });
    expect(splitNaam("Piet de Vries")).toEqual({ voornaam: "Piet", achternaam: "de Vries" });
  });
  it("laat het eerste woord altijd de voornaam", () => {
    expect(splitNaam("Van Essen")).toEqual({ voornaam: "Van", achternaam: "Essen" });
    expect(splitNaam("Madonna")).toEqual({ voornaam: "Madonna", achternaam: "" });
    expect(splitNaam("  ")).toEqual({ voornaam: "", achternaam: "" });
    expect(splitNaam(null)).toEqual({ voornaam: "", achternaam: "" });
  });
  it("voegt samen zonder dubbele spaties en keert terug naar dezelfde naam", () => {
    expect(voegNaam(" Jan ", "van  Essen")).toBe("Jan van Essen");
    const n = splitNaam("Fatima El Amrani");
    expect(voegNaam(n.voornaam, n.achternaam)).toBe("Fatima El Amrani");
  });
});

describe("telefoon naar E.164", () => {
  it("zet een Nederlands nummer met landnummer +31 om", () => {
    expect(telefoonNaarE164("+31", "06 12345678")).toBe("+31612345678");
    expect(telefoonNaarE164("+31", "0612345678")).toBe("+31612345678");
    expect(telefoonNaarE164("+31", "612345678")).toBe("+31612345678");
    expect(telefoonNaarE164("+31", "06-1234 5678")).toBe("+31612345678");
  });
  it("een nummer met eigen landcode houdt zijn land", () => {
    expect(telefoonNaarE164("+31", "+48 512 345 678")).toBe("+48512345678");
    expect(telefoonNaarE164("+31", "0048512345678")).toBe("+48512345678");
  });
  it("gebruikt het gekozen landnummer en laat de voorloopnul vallen", () => {
    expect(telefoonNaarE164("+48", "512 345 678")).toBe("+48512345678");
    expect(telefoonNaarE164("+32", "0470 12 34 56")).toBe("+32470123456");
  });
  it("weigert een verkeerde lengte of tekst", () => {
    expect(telefoonNaarE164("+31", "06 1234")).toBeNull();
    expect(telefoonNaarE164("+31", "06 12345678 9")).toBeNull();
    expect(telefoonNaarE164("+31", "abc")).toBeNull();
    expect(telefoonNaarE164("+31", "")).toBeNull();
    expect(telefoonNaarE164("", "0612345678")).toBeNull();
  });
  it("splitst een opgeslagen nummer terug voor het formulier", () => {
    expect(splitTelefoon("+31612345678")).toEqual({ landnummer: "+31", nummer: "0612345678" });
    expect(splitTelefoon("+48512345678")).toEqual({ landnummer: "+48", nummer: "512345678" });
    expect(splitTelefoon("+352621123456")).toEqual({ landnummer: "+352", nummer: "621123456" });
    expect(splitTelefoon(null)).toEqual({ landnummer: "+31", nummer: "" });
  });
  it("kent elk landnummer maar één keer per land", () => {
    expect(new Set(LANDNUMMERS.map((l) => l.land)).size).toBe(LANDNUMMERS.length);
    expect(LANDNUMMERS[0]).toEqual({ land: "NL", nummer: "+31" });
  });
});

describe("geboortedatum en 18+", () => {
  it("leest alleen bestaande datums", () => {
    expect(leesDatum("2001-04-09")).toEqual({ jaar: 2001, maand: 4, dag: 9 });
    expect(leesDatum("2001-02-30")).toBeNull();
    expect(leesDatum("2001-13-01")).toBeNull();
    expect(leesDatum("09-04-2001")).toBeNull();
  });
  it("is 18 op de verjaardag zelf, niet een dag eerder", () => {
    expect(isMeerderjarig("2008-11-12", NU)).toBe(true);
    expect(isMeerderjarig("2008-11-13", NU)).toBe(false);
    expect(isMeerderjarig("1990-01-01", NU)).toBe(true);
  });
  it("een schrikkeldag telt in een gewoon jaar een dag later", () => {
    expect(isMeerderjarig("2008-02-29", new Date("2026-02-28T12:00:00+01:00"))).toBe(false);
    expect(isMeerderjarig("2008-02-29", new Date("2026-03-01T12:00:00+01:00"))).toBe(true);
  });
  it("geeft de juiste foutsleutel", () => {
    expect(controleerGeboortedatum("", NU)).toBe("leeg");
    expect(controleerGeboortedatum("2001-02-30", NU)).toBe("ongeldig");
    expect(controleerGeboortedatum("2030-01-01", NU)).toBe("ongeldig");
    expect(controleerGeboortedatum("1900-01-01", NU)).toBe("ongeldig");
    expect(controleerGeboortedatum("2015-05-05", NU)).toBe("onder18");
    expect(controleerGeboortedatum("1995-05-05", NU)).toBeNull();
  });
});

describe("stap 1 als geheel", () => {
  const goed = { voornaam: "Jan", achternaam: "van Essen", geboortedatum: "1995-05-05", landnummer: "+31", telefoon: "06 12345678" };
  it("keurt goede gegevens goed", () => {
    expect(controleerPersoon(goed, NU)).toEqual({});
  });
  it("markeert per veld wat mist, met onder 18 als eigen melding", () => {
    expect(controleerPersoon({ ...goed, voornaam: " ", achternaam: "" }, NU)).toEqual({ voornaam: "voornaam", achternaam: "achternaam" });
    expect(controleerPersoon({ ...goed, geboortedatum: "2015-01-01" }, NU)).toEqual({ geboortedatum: "onder18" });
    expect(controleerPersoon({ ...goed, telefoon: "12" }, NU)).toEqual({ telefoon: "telefoon" });
    expect(controleerPersoon({ ...goed, geboortedatum: "" }, NU)).toEqual({ geboortedatum: "datum" });
  });
});

describe("het aantal stappen", () => {
  it("drie stappen, of twee als de identiteit al is bevestigd", () => {
    expect(stappenVoor({ idKlaar: false })).toEqual(["persoon", "woon", "id"]);
    expect(stappenVoor({ idKlaar: true })).toEqual(["persoon", "woon"]);
  });
  it("gaat verder bij de eerste stap die niet af is", () => {
    expect(beginStap({ persoonKlaar: false, woonKlaar: false, idKlaar: false })).toBe("persoon");
    expect(beginStap({ persoonKlaar: true, woonKlaar: false, idKlaar: false })).toBe("woon");
    expect(beginStap({ persoonKlaar: true, woonKlaar: true, idKlaar: false })).toBe("id");
    expect(beginStap({ persoonKlaar: true, woonKlaar: true, idKlaar: true })).toBe("woon");
  });
});

describe("opleiding", () => {
  it("heeft zestien richtingen en vier niveaus, in alle vijf de talen", () => {
    expect(OPLEIDING_RICHTINGEN).toHaveLength(16);
    expect(OPLEIDING_NIVEAUS).toHaveLength(4);
    for (const l of LOCALES) {
      for (const r of OPLEIDING_RICHTINGEN) expect(RICHTING_LABELS[l][r].length, `${l} ${r}`).toBeGreaterThan(1);
      for (const n of OPLEIDING_NIVEAUS) expect(NIVEAU_LABELS[l][n].length, `${l} ${n}`).toBeGreaterThan(1);
    }
  });
  it("een richting hoort alleen bij MBO, HBO en Universiteit", () => {
    expect(heeftRichting("middelbaar")).toBe(false);
    expect(heeftRichting("mbo")).toBe(true);
    expect(schoonOpleiding({ niveau: "middelbaar", richting: "techniek" })).toEqual({ niveau: "middelbaar" });
    expect(schoonOpleiding({ niveau: "hbo", richting: "techniek" })).toEqual({ niveau: "hbo", richting: "techniek" });
    expect(schoonOpleiding({ niveau: "hbo", richting: "constructor" })).toEqual({ niveau: "hbo" });
    expect(schoonOpleiding({ niveau: "constructor" })).toBeNull();
    expect(schoonOpleiding(null)).toBeNull();
  });
  it("zoekt zonder hoofdletters en accenten, in de taal van de werker", () => {
    expect(filterRichtingen("", "nl")).toHaveLength(16);
    expect(filterRichtingen("ZORG", "nl")).toEqual(expect.arrayContaining(["gezondheid", "zorg"]));
    expect(filterRichtingen("księgow", "pl")).toEqual(["financieel"]);
    expect(filterRichtingen("xyzxyz", "nl")).toEqual([]);
  });
});

describe("vijf talen", () => {
  it("elke taal heeft dezelfde sleutels als het Nederlands (stappenscherm en scanroutes)", () => {
    const vorm = (o: unknown): unknown => (Array.isArray(o) ? o.map(vorm) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, vorm(v)])) : typeof o);
    for (const l of LOCALES) {
      expect(vorm(WIE_TEKSTEN[l]), l).toEqual(vorm(WIE_TEKSTEN.nl));
      expect(vorm(SCAN_EXTRA[l]), l).toEqual(vorm(SCAN_EXTRA.nl));
      expect(WIE_TEKSTEN[l].datum.maanden).toHaveLength(12);
    }
  });
  it("verwijst in de teksten niet naar externe adressen", () => {
    const alles = JSON.stringify([WIE_TEKSTEN, SCAN_EXTRA]).toLowerCase();
    expect(alles).not.toContain("http");
  });
});
