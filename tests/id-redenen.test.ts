import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/config";
import { ID_LABELS, ID_REDENEN, idRedenSleutel, idUitslagVoorWerker, taalVanVerzoek, vertaalIdTekst } from "@/lib/i18n/id-redenen";

// De redenen van een ID-controle in vijf talen (13 nov 2026): een Poolse werker las ze in het Nederlands. De Nederlandse tekst
// in het woordenboek moet gelijk blijven aan die op de plek waar hij ontstaat, anders vertaalt er stil niets meer.

const ALLES = { ...ID_REDENEN, ...ID_LABELS };
const bron = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const plaatshouders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Waar elke Nederlandse tekst ontstaat (bij een plaatshouder: het stuk na de laatste plaatshouder). */
const WAAR: Record<keyof typeof ALLES, string> = {
  "gezicht.twijfel": "lib/kyc/gezicht/vergelijk.ts",
  "naam.wijktAf": "lib/onboarding/verify.ts",
  "mrz.nietGevonden": "lib/onboarding/verify.ts",
  "beweging.nietGedraaid": "lib/kyc/gezicht/beweging.ts",
  "beweging.nietAangeleverd": "lib/kyc/gezicht/beweging.ts",
  "beweging.onnatuurlijk": "lib/kyc/gezicht/beweging.ts",
  "kvk.nietBereikbaar": "lib/onboarding/verify.ts",
  "kvk.later": "lib/onboarding/verify.ts",
  "vies.ongeldig": "lib/onboarding/verify.ts",
  "ai.nietBeschikbaar": "lib/onboarding/verify.ts",
  "label.gezicht": "lib/onboarding/verify.ts",
  "label.naam": "lib/onboarding/verify.ts",
  "label.naamDocument": "lib/onboarding/verify.ts",
  "label.mrz": "lib/onboarding/verify.ts",
  "label.beweging": "lib/onboarding/verify.ts",
  "label.kvk": "lib/onboarding/verify.ts",
  "label.vies": "lib/onboarding/verify.ts",
  "label.thuisbasis": "lib/onboarding/verify.ts",
  "label.werkvorm": "lib/onboarding/verify.ts",
  "label.fotos": "lib/onboarding/verify.ts",
  "label.documentnummer": "lib/onboarding/verify.ts",
  "label.geldigheid": "lib/onboarding/verify.ts",
  "label.nummerOvereen": "lib/onboarding/verify.ts",
  "label.echtheid": "lib/onboarding/verify.ts",
  "label.gezichtBeeld": "lib/onboarding/verify.ts",
  "label.spoof": "lib/onboarding/verify.ts",
  "label.chip": "lib/onboarding/verify.ts",
  "label.werkrecht": "lib/onboarding/verify.ts",
  "label.leeftijd": "lib/onboarding/verify.ts",
  "label.telefoon": "lib/onboarding/verify.ts",
  "label.telefoonEerder": "lib/onboarding/verify.ts",
  "label.wallet": "lib/onboarding/verify.ts",
  "werkrecht.vrij": "lib/kyc/werkrecht.ts",
  "werkrecht.controle": "lib/kyc/werkrecht.ts",
  "leeftijd.volwassen": "lib/kyc/werkrecht.ts",
  "leeftijd.minderjarig": "lib/kyc/werkrecht.ts",
  "leeftijd.teJong": "lib/kyc/werkrecht.ts",
  "telefoon.binnen": "lib/onboarding/verify.ts",
  "telefoon.eerder": "lib/onboarding/verify.ts",
  "nummer.formaatOk": "lib/onboarding/verify.ts",
  "nummer.formaatFout": "lib/onboarding/verify.ts",
  "nummer.overeen": "lib/onboarding/verify.ts",
  "nummer.wijktAf": "lib/onboarding/verify.ts",
  "geldig.tot": "lib/onboarding/verify.ts",
  "geldig.verlopen": "lib/onboarding/verify.ts",
  "geldig.walletVerlopen": "lib/onboarding/verify.ts",
  "fotos.ok": "lib/onboarding/verify.ts",
  "fotos.onleesbaar": "lib/onboarding/verify.ts",
  "werkvorm.uitzend": "lib/onboarding/verify.ts",
  "thuisbasis.globaal": "lib/onboarding/verify.ts",
  "naam.overeen": "lib/onboarding/verify.ts",
  "naam.gelezen": "lib/onboarding/verify.ts",
  "wallet.ok": "lib/onboarding/verify.ts",
};

describe("het woordenboek", () => {
  it("heeft elke tekst in alle vijf talen, met dezelfde plaatshouders", () => {
    for (const [sleutel, t] of Object.entries(ALLES)) {
      for (const taal of LOCALES) {
        expect(t[taal].trim(), `${sleutel}/${taal}`).not.toBe("");
        expect(plaatshouders(t[taal]), `${sleutel}/${taal}`).toEqual(plaatshouders(t.nl));
      }
      // een vertaling die gelijk is aan het Nederlands is vergeten (behalve een eigennaam als KVK)
      expect(t.en, sleutel).not.toBe(t.nl);
    }
  });

  it("de Nederlandse tekst staat letterlijk op de plek waar hij ontstaat", () => {
    for (const [sleutel, t] of Object.entries(ALLES) as [keyof typeof ALLES, { nl: string }][]) {
      const stuk = t.nl.split(/\{\w+\}/).filter((d) => d.trim()).at(-1) ?? t.nl;
      expect(bron(WAAR[sleutel]), `${sleutel} in ${WAAR[sleutel]}`).toContain(stuk.trim() ? stuk : t.nl);
    }
  });

  it("de KVK-dienst stuurt geen technische (Engelse) melding meer naar de werker", () => {
    expect(bron("lib/onboarding/verify.ts")).toContain('err.code === "UPSTREAM_UNAVAILABLE"');
  });
});

describe("vertaalIdTekst", () => {
  const twijfel = ID_REDENEN["gezicht.twijfel"].nl;

  it("Nederlands blijft Nederlands; elke andere taal krijgt de vertaling", () => {
    expect(vertaalIdTekst(twijfel, "nl")).toBe(twijfel);
    for (const taal of LOCALES.filter((l) => l !== "nl")) expect(vertaalIdTekst(twijfel, taal)).toBe(ID_REDENEN["gezicht.twijfel"][taal]);
  });

  it("een onbekende tekst valt terug op het Nederlands, in elke taal", () => {
    const onbekend = "Een uitleg die (nog) niet in het woordenboek staat";
    for (const taal of LOCALES) expect(vertaalIdTekst(onbekend, taal)).toBe(onbekend);
    // ook geen sleutel uit het prototype van een object
    expect(idRedenSleutel("constructor")).toBeNull();
    expect(vertaalIdTekst("constructor", "pl")).toBe("constructor");
  });

  it("een plaatshouder komt met dezelfde waarde terug", () => {
    const nl = "NL123456789B01 is volgens de EU-database (VIES) niet geldig.";
    expect(idRedenSleutel(nl)).toEqual({ sleutel: "vies.ongeldig", waarden: { nummer: "NL123456789B01" } });
    expect(vertaalIdTekst(nl, "en")).toBe("According to the EU database (VIES), NL123456789B01 is not valid.");
    for (const taal of LOCALES) expect(vertaalIdTekst(nl, taal)).toContain("NL123456789B01");
  });

  it("vertaalt ook oudere teksten die al in eerdere pogingen staan", () => {
    expect(vertaalIdTekst("KVKBase rate limit reached, retry shortly", "uk")).toBe(ID_REDENEN["kvk.nietBereikbaar"].uk);
    const kwartslag = "Je hoofd was op de tweede selfie niet duidelijk gedraaid. Draai het een kwartslag naar links of rechts en maak de foto opnieuw.";
    expect(vertaalIdTekst(kwartslag, "ro")).toBe(ID_REDENEN["beweging.nietGedraaid"].ro);
  });
});

describe("idUitslagVoorWerker", () => {
  const uitslag = {
    outcome: "in_review" as const,
    summary: "In behandeling",
    checks: [
      { label: ID_LABELS["label.gezicht"].nl, ok: false, detail: ID_REDENEN["gezicht.twijfel"].nl },
      { label: "Een controle die (nog) niet in het woordenboek staat", ok: true, detail: "Een uitleg die (nog) niet in het woordenboek staat" },
    ],
    reasons: [ID_REDENEN["gezicht.twijfel"].nl, ID_REDENEN["ai.nietBeschikbaar"].nl],
  };

  it("vertaalt naam, uitleg en redenen, met de sleutel erbij; de rest blijft staan", () => {
    const pl = idUitslagVoorWerker(uitslag, "pl");
    expect(pl.checks[0]).toEqual({ label: ID_LABELS["label.gezicht"].pl, ok: false, detail: ID_REDENEN["gezicht.twijfel"].pl, sleutel: "gezicht.twijfel" });
    // onbekend: Nederlands, zonder sleutel
    expect(pl.checks[1]).toEqual(uitslag.checks[1]);
    expect(pl.reasons).toEqual([ID_REDENEN["gezicht.twijfel"].pl, ID_REDENEN["ai.nietBeschikbaar"].pl]);
    expect(pl.outcome).toBe("in_review");
    expect(pl.summary).toBe("In behandeling");
  });

  it("in het Nederlands verandert er niets (rawPayload en beheer houden de tekst ook)", () => {
    expect(idUitslagVoorWerker(uitslag, "nl")).toBe(uitslag);
  });

  it("de taal komt uit de cookie van het verzoek; onbekend of zonder cookie is Nederlands", () => {
    const met = (cookie: string | null) => new Request("https://zekerflex.com/api/onboarding", cookie ? { headers: { cookie } } : {});
    expect(taalVanVerzoek(met("a=1; zf_locale=pl; b=2"))).toBe("pl");
    expect(taalVanVerzoek(met("zf_locale=xx"))).toBe("nl");
    expect(taalVanVerzoek(met(null))).toBe("nl");
  });

  it("zonder checks of redenen (bewaren, Stripe) gaat het ook", () => {
    expect(idUitslagVoorWerker({ redirectUrl: "/x", checks: [] }, "en")).toEqual({ redirectUrl: "/x", checks: [] });
  });
});
