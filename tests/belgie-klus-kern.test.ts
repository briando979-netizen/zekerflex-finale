import { describe, expect, it } from "vitest";
import {
  BELGIE_BRONNEN,
  BELGIE_CHECKLIST,
  BELGISCHE_CONTRACTEN,
  DIMONA_TYPE,
  LATERE_CONTRACTEN,
  LEGE_BELGIE_KLUS,
  SJABLONEN_PER_SOORT,
  belgieKiesReden,
  checklistStand,
  isBelgischeKlus,
  leesBelgieKlus,
  leesDimonaNummer,
  lijktRijksregisternummer,
  metSoort,
  metVinkje,
} from "@/lib/belgie/klus-kern";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

// Een klus op een Belgische werklocatie (lib/belgie/klus-kern.ts): het land uit de postcode, de soort contract, de bevestiging
// van het bedrijf, de checklist en het Dimona-nummer, dat nooit een rijksregisternummer mag zijn.

describe("welke klus in België ligt", () => {
  it("alleen een postcode met BE- ervoor; Nederland blijft Nederland", () => {
    expect(isBelgischeKlus("BE-2000")).toBe(true);
    expect(isBelgischeKlus("1012 AB")).toBe(false);
    expect(isBelgischeKlus("3511")).toBe(false);
    expect(isBelgischeKlus("2000")).toBe(false);
    expect(isBelgischeKlus(null)).toBe(false);
    expect(isBelgischeKlus(undefined)).toBe(false);
  });
});

describe("de soorten contract", () => {
  it("student en flexi-job te kiezen; uitzend en zelfstandige volgen later", () => {
    expect([...BELGISCHE_CONTRACTEN]).toEqual(["student", "flexi"]);
    expect([...LATERE_CONTRACTEN]).toEqual(["uitzend", "zelfstandige"]);
    expect(DIMONA_TYPE).toEqual({ student: "STU", flexi: "FLX" });
    expect(SJABLONEN_PER_SOORT).toEqual({ student: ["student"], flexi: ["flexi-raam", "flexi-arbeid"] });
  });

  it("de checklist: Student@work, overeenkomst en Dimona STU; raamovereenkomst, flexi-overeenkomst, Dimona FLX en de RSZ", () => {
    expect(BELGIE_CHECKLIST.student.map((v) => v.id)).toEqual(["saldo", "studentenovereenkomst", "dimonaStu"]);
    expect(BELGIE_CHECKLIST.flexi.map((v) => v.id)).toEqual(["raamovereenkomst", "flexiOvereenkomst", "dimonaFlx", "flexiVoorwaarden"]);
    for (const v of [...BELGIE_CHECKLIST.student, ...BELGIE_CHECKLIST.flexi]) {
      expect(BELGIE_BRONNEN[v.bron]).toMatch(/^https:\/\//);
      // elke stap heeft een titel en uitleg in het Nederlands en het Engels
      expect(nl.belgie.vinkjes[v.id].titel.length).toBeGreaterThan(5);
      expect(en.belgie.vinkjes[v.id].uitleg.length).toBeGreaterThan(5);
    }
  });
});

describe("de bewaarde keuze", () => {
  it("leest soepel: onzin valt weg, een bevestiging hoort bij zijn soort", () => {
    expect(leesBelgieKlus(null)).toEqual(LEGE_BELGIE_KLUS);
    expect(leesBelgieKlus({ soort: "uitzend", vinkjes: ["saldo"] })).toEqual(LEGE_BELGIE_KLUS);
    expect(leesBelgieKlus({ soort: "student", horeca: true, vinkjes: ["saldo", "dimonaFlx", "saldo", 3] })).toEqual({
      soort: "student",
      horeca: false,
      bevestiging: null,
      vinkjes: ["saldo"],
    });
    const bevestigd = { door: "m1", op: "2026-11-28T10:00:00.000Z", dimona: "FLX" };
    expect(leesBelgieKlus({ soort: "flexi", horeca: true, bevestiging: bevestigd }).bevestiging).toEqual(bevestigd);
    // een bevestiging voor een andere Dimona telt niet
    expect(leesBelgieKlus({ soort: "student", bevestiging: bevestigd }).bevestiging).toBeNull();
  });

  it("een andere soort wist de bevestiging en de vinkjes; dezelfde soort laat ze staan", () => {
    const klus = { soort: "student" as const, horeca: false, bevestiging: { door: "m1", op: "x", dimona: "STU" as const }, vinkjes: ["saldo" as const] };
    expect(metSoort(klus, "student", false)).toEqual(klus);
    expect(metSoort(klus, "flexi", true)).toEqual({ soort: "flexi", horeca: true, bevestiging: null, vinkjes: [] });
    expect(metSoort(LEGE_BELGIE_KLUS, "student", true).horeca).toBe(false);
  });

  it("vinkjes aan en uit, alleen die van de eigen soort", () => {
    const klus = metSoort(LEGE_BELGIE_KLUS, "flexi", false);
    const aan = metVinkje(klus, "dimonaFlx", true);
    expect(aan.vinkjes).toEqual(["dimonaFlx"]);
    expect(checklistStand(aan)).toEqual({ klaar: 1, totaal: 4 });
    expect(metVinkje(aan, "dimonaFlx", false).vinkjes).toEqual([]);
    expect(metVinkje(aan, "saldo", true).vinkjes).toEqual(["dimonaFlx"]);
    expect(checklistStand(LEGE_BELGIE_KLUS)).toEqual({ klaar: 0, totaal: 0 });
  });

  it("kiezen kan pas met een soort en de bevestiging van het bedrijf", () => {
    expect(belgieKiesReden(LEGE_BELGIE_KLUS)).toBe("soort");
    const student = metSoort(LEGE_BELGIE_KLUS, "student", false);
    expect(belgieKiesReden(student)).toBe("bevestiging");
    expect(belgieKiesReden({ ...student, bevestiging: { door: "m1", op: "x", dimona: "STU" } })).toBeNull();
  });
});

describe("het Dimona-nummer, nooit een rijksregisternummer", () => {
  it("herkent een rijksregisternummer (ook van na 2000 en met puntjes)", () => {
    expect(lijktRijksregisternummer("90010112395")).toBe(true);
    expect(lijktRijksregisternummer("05010112385")).toBe(true);
    expect(lijktRijksregisternummer("90010112396")).toBe(false);
    expect(lijktRijksregisternummer("1234567890")).toBe(false);
    expect(leesDimonaNummer("90.01.01-123.95")).toEqual({ ok: false, reden: "rijksregister" });
    expect(leesDimonaNummer("05 01 01 123 85")).toEqual({ ok: false, reden: "rijksregister" });
  });

  it("neemt een gewoon bevestigingsnummer over, zonder spaties of streepjes", () => {
    expect(leesDimonaNummer(" 1234-5678-9012 ")).toEqual({ ok: true, nummer: "123456789012" });
    expect(leesDimonaNummer("abc123def")).toEqual({ ok: true, nummer: "ABC123DEF" });
  });

  it("weigert leeg, te kort, te lang of met rare tekens", () => {
    expect(leesDimonaNummer("   ")).toEqual({ ok: false, reden: "leeg" });
    expect(leesDimonaNummer("12345")).toEqual({ ok: false, reden: "vorm" });
    expect(leesDimonaNummer("1".repeat(21))).toEqual({ ok: false, reden: "vorm" });
    expect(leesDimonaNummer("1234567#")).toEqual({ ok: false, reden: "vorm" });
  });
});
