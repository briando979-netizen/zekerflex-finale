import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { conceptCost } from "@/lib/klusconcept/concept";
import { euroCents, euroWhole } from "@/lib/rekentools/invoer";
import { pauzeKeuzes, SNEL_EN, SNEL_NL, snelSamenvatting } from "@/components/werkgever/snel-teksten";

// "Snel een klus plaatsen" in de werkgeversapp (components/werkgever/SnelPlaatsen.tsx). 22 nov 2026, gebruikersonderzoek
// B06 tegen B25: zonder account zag een bedrijf op /klus-plaatsen "Totaal excl. btw € 154", vlak voor "Plaats de klus" in de
// echte wizard alleen "€ 17 per uur". Nu staat daar dezelfde kostenregel, met hetzelfde rekenhulpje.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("de teksten", () => {
  it("Nederlands en Engels hebben dezelfde sleutels, en geen enkele is leeg", () => {
    expect(Object.keys(SNEL_EN).sort()).toEqual(Object.keys(SNEL_NL).sort());
    for (const [k, v] of Object.entries(SNEL_NL)) expect(v.trim(), k).not.toBe("");
    for (const [k, v] of Object.entries(SNEL_EN)) expect(v.trim(), k).not.toBe("");
  });

  it("de pauzes zijn die van /klus-plaatsen; een afwijkende pauze uit een concept komt erbij", () => {
    expect(pauzeKeuzes(30)).toEqual([0, 15, 30, 45, 60]);
    expect(pauzeKeuzes(20)).toEqual([0, 15, 20, 30, 45, 60]);
  });
});

// B25: "Bediening / horeca op 2026-11-24 van 10:00 tot 16:00, 1 persoon/personen, € 17 per uur."
describe("de samenvatting", () => {
  const klus = { titel: "Bediening / horeca", datum: "2026-11-24", van: "10:00", tot: "16:00", personen: 1, pauze: 0, tarief: "17" };

  it("schrijft de datum uit en kiest enkel- of meervoud", () => {
    expect(snelSamenvatting(SNEL_NL, klus)).toBe("Bediening / horeca op dinsdag 24 november van 10:00 tot 16:00, 1 persoon, € 17 per uur.");
    expect(snelSamenvatting(SNEL_NL, { ...klus, personen: 3, pauze: 30, tot: "17:00", tarief: "17.50" })).toBe(
      "Bediening / horeca op dinsdag 24 november van 10:00 tot 17:00 (30 minuten pauze), 3 personen, € 17,50 per uur.",
    );
    expect(snelSamenvatting(SNEL_EN, klus, "en")).toBe("Bediening / horeca on Tuesday 24 November from 10:00 until 16:00, 1 person, € 17 per hour.");
  });

  it("geen schuine streep meer voor enkel- en meervoud, en het scherm gebruikt de samenvatting", () => {
    expect(SNEL_NL.samenvatting).not.toContain("/");
    expect(SNEL_EN.samenvatting).not.toContain("(s)");
    expect(lees("components/werkgever/SnelPlaatsen.tsx")).toContain("snelSamenvatting(t, { titel, datum, van, tot, personen, pauze, tarief }, locale)");
  });
});

describe("de kostenregel bij Plaats de klus", () => {
  it("rekent zoals /klus-plaatsen: 1 persoon, 7,5 uur, € 17 = € 154 excl. btw", () => {
    const k = conceptCost({ start: "09:00", end: "17:00", breakMinutes: 30, positions: 1, rateCents: 1_700 });
    expect(euroCents(k.grossTotalCents)).toMatch(/€\s127,50/);
    expect(euroCents(k.feeTotalCents)).toMatch(/€\s26,25/);
    expect(euroWhole(k.totalCents)).toMatch(/€\s154$/);
  });

  it("zonder pauze en met meer mensen telt het platform over alle gewerkte uren", () => {
    const k = conceptCost({ start: "10:00", end: "16:00", breakMinutes: 0, positions: 2, rateCents: 1_700 });
    expect(k.totalHours).toBe(12);
    expect(k.grossTotalCents).toBe(20_400);
    expect(k.feeTotalCents).toBe(4_200);
  });

  it("het scherm gebruikt dat rekenhulpje en de pauze, en rekent zelf geen platformtarief uit", () => {
    const s = lees("components/werkgever/SnelPlaatsen.tsx");
    expect(s).toContain("conceptCost({ start: van, end: tot, breakMinutes: pauze, positions: personen, rateCents: tariefCent })");
    expect(s).toContain("{t.kostenTotaal}");
    expect(s).toContain("euroWhole(kosten.totalCents)");
    expect(s).not.toMatch(/\b3[.,]5\b|\b350\b/);
    // de pauze gaat mee naar de server
    expect(s).toContain('name="breakMinutes" value={String(pauze)}');
  });

  it("de pagina haalt de teksten uit het pure bestand", () => {
    expect(lees("app/werkgever/diensten/nieuw/page.tsx")).toContain('import { SNEL_EN, SNEL_NL } from "@/components/werkgever/snel-teksten";');
  });
});
