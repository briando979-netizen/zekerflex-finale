import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canPostShift, conceptCost, conceptHours, conceptOntbreekt, klusUrl, naarSnelFormulier, parseConcept, SECTOR_TEMPLATE, supplyLabel, supplyNear, toShiftFormValues, type KlusConcept } from "@/lib/klusconcept/concept";
import { SECTORS } from "@/lib/seo-sectors";

const base: KlusConcept = {
  v: 1,
  title: "Bediening / horeca",
  description: "Gasten bedienen.",
  city: "Utrecht",
  date: "2026-11-20",
  start: "09:00",
  end: "17:00",
  breakMinutes: 30,
  positions: 2,
  rateCents: 1_700,
  savedAt: 1_000_000,
};

describe("klusconcept: uren en kosten", () => {
  it("counts the hours minus the break", () => {
    expect(conceptHours(base)).toBe(7.5);
  });

  it("runs past midnight when the end is earlier", () => {
    expect(conceptHours({ start: "22:00", end: "06:00", breakMinutes: 30 })).toBe(7.5);
  });

  it("never goes below zero and ignores nonsense times", () => {
    expect(conceptHours({ start: "09:00", end: "09:10", breakMinutes: 30 })).toBe(0);
    expect(conceptHours({ start: "25:00", end: "09:00", breakMinutes: 0 })).toBe(0);
  });

  it("adds € 3,50 per worked hour on top of the rate", () => {
    const c = conceptCost(base);
    expect(c.totalHours).toBe(15);
    expect(c.grossPerPersonCents).toBe(12_750);
    expect(c.grossTotalCents).toBe(25_500);
    expect(c.feeTotalCents).toBe(5_250);
    expect(c.totalCents).toBe(30_750);
  });
});

describe("klusconcept: naar het klusformulier", () => {
  it("fills the werkgever form in its own format", () => {
    expect(toShiftFormValues(base)).toEqual({
      title: "Bediening / horeca",
      description: "Gasten bedienen.",
      rateEuro: "17.00",
      breakMin: "30",
      positions: "2",
      startsAt: "2026-11-20T09:00",
      endsAt: "2026-11-20T17:00",
    });
  });

  it("puts a night shift's end on the next day, also across a month", () => {
    expect(toShiftFormValues({ ...base, date: "2026-11-30", start: "22:00", end: "06:00" }).endsAt).toBe("2026-12-01T06:00");
  });
});

// 22 nov 2026 (gebruikersonderzoek B07/B21): na het aanmelden was "Snel een klus plaatsen" leeg, terwijl de server het concept had.
describe("klusconcept: naar Snel een klus plaatsen", () => {
  it("vult functie, datum, tijden, aantal, pauze en tarief in en opent op de laatste stap", () => {
    expect(naarSnelFormulier(base, 1_620)).toEqual({
      titel: "Bediening / horeca",
      omschrijving: "Gasten bedienen.",
      datum: "2026-11-20",
      van: "09:00",
      tot: "17:00",
      personen: 2,
      pauze: 30,
      tarief: "17.00",
      stap: 3,
    });
  });

  it("zet een uur met één cijfer om naar twee (een tijdveld wil 09:00) en houdt het minimumtarief aan", () => {
    const v = naarSnelFormulier({ ...base, start: "9:00", rateCents: 1_500 }, 1_620);
    expect(v.van).toBe("09:00");
    expect(v.tarief).toBe("16.20");
  });

  it("een nachtdienst opent bij de tijden: het snelle formulier kent geen eindtijd na middernacht", () => {
    expect(naarSnelFormulier({ ...base, start: "22:00", end: "06:00" }, 1_620).stap).toBe(2);
  });
});

describe("klusconcept: één formulier neemt het concept over", () => {
  const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

  it("het uitgebreide formulier is de standaard en leest het concept; Snel een klus plaatsen (?snel=1) leest het alleen daar", () => {
    const snel = lees("components/werkgever/SnelPlaatsen.tsx");
    expect(snel).toContain("useKlusConcept({ aan: !voorinvulling, wis: true })");
    expect(snel).toContain("naarSnelFormulier(concept, minRateCents)");
    // de pauze en de omschrijving uit het concept gaan mee naar de server
    expect(snel).toContain('name="breakMinutes" value={String(pauze)}');
    expect(snel).toContain('name="description" value={omschrijving ?? sjabloon?.description ?? ""}');
    // één formulier per scherm met `wis`: in de snelle weg neemt SnelPlaatsen het concept, anders het uitgebreide formulier (ook bij "Klus dupliceren" niet)
    const pagina = lees("app/werkgever/diensten/nieuw/page.tsx");
    expect(pagina).toContain("leesConcept={!snelModus && !voorinvulling}");
    expect(pagina).toContain('const snelModus = alleenFlexwerk && snelParam === "1";');
    const formulier = lees("components/app/NewShiftForm.tsx");
    expect(formulier).toContain("useKlusConcept({ aan: !editing && leesConcept, wis: true })");
    // het concept vult het uitgebreide formulier: titel, omschrijving, tarief, pauze, plekken en tijden, en we openen bij de tweede stap
    for (const stuk of ["setTitle(v.title);", "setDescription(v.description);", "setRateEuro(v.rateEuro);", "setBreakMin(v.breakMin);", "setPositions(v.positions);", "setStartsAt(v.startsAt);", "setEndsAt(v.endsAt);", "setFromWebsite(true);", "setStap(2);"]) {
      expect(formulier, stuk).toContain(stuk);
    }
  });

  it("de hook leest eerst deze browser en anders de server, en wist alleen met wis", () => {
    const hook = lees("components/werkgever/useKlusConcept.ts");
    expect(hook).toContain("localStorage.getItem(CONCEPT_KEY)");
    expect(hook).toContain("if (raw && wis) localStorage.removeItem(CONCEPT_KEY)");
    expect(hook).toContain('fetch("/api/werkgever/klus-concept"');
    // de melding op het startscherm leest alleen, ook in de startmodus van een nieuw bedrijf
    expect(lees("components/app/KlusConceptNudge.tsx")).toContain("useKlusConcept()");
    expect(lees("app/werkgever/page.tsx")).not.toContain("{!startModus && <KlusConceptNudge />}");
  });
});

describe("klusconcept: bewaren in de browser", () => {
  const raw = JSON.stringify(base);

  it("reads a good draft back", () => {
    expect(parseConcept(raw, base.savedAt + 1000, "2026-11-03")?.title).toBe("Bediening / horeca");
  });

  it("drops a broken, old or past draft", () => {
    expect(parseConcept("{kapot", base.savedAt)).toBeNull();
    expect(parseConcept(null, base.savedAt)).toBeNull();
    expect(parseConcept(raw, base.savedAt + 15 * 24 * 3600_000)).toBeNull();
    expect(parseConcept(raw, base.savedAt, "2026-11-21")).toBeNull();
    expect(parseConcept(JSON.stringify({ ...base, rateCents: -5 }), base.savedAt)).toBeNull();
    expect(parseConcept(JSON.stringify({ ...base, positions: 500 }), base.savedAt)).toBeNull();
  });
});

describe("klusconcept: vanaf de sectorpagina's", () => {
  it("fills in the function and place", () => {
    expect(klusUrl({ sector: "horeca", city: "Den Haag" })).toBe("/klus-plaatsen?functie=horeca&plaats=Den+Haag");
    expect(klusUrl({ sector: "logistiek" })).toBe("/klus-plaatsen?functie=magazijn");
    expect(klusUrl({ sector: "onbekend", city: "Utrecht" })).toBe("/klus-plaatsen?plaats=Utrecht");
    expect(klusUrl()).toBe("/klus-plaatsen");
  });

  it("has a template for every sector page", () => {
    // keys must exist in SHIFT_TEMPLATES (lib/shifts/create.ts)
    const templateKeys = ["vakkenvuller", "kassa", "magazijn", "schoonmaak", "horeca", "receptie", "promotie", "bezorger"];
    for (const s of SECTORS) expect(templateKeys, s.key).toContain(SECTOR_TEMPLATE[s.key]);
  });
});

describe("klusconcept: ingelogde werkgever", () => {
  it("sends only roles that may put out a dienst straight to the form", () => {
    expect(canPostShift(["HQ_ADMIN"])).toBe(true);
    expect(canPostShift(["FREELANCER", "LOCAL_MANAGER"])).toBe(true);
    expect(canPostShift(["FREELANCER"])).toBe(false);
    expect(canPostShift(["DISPUTE_MANAGER"])).toBe(false);
    expect(canPostShift(undefined)).toBe(false);
    expect(canPostShift("HQ_ADMIN")).toBe(false);
  });
});

describe("klusconcept: krachten in de buurt", () => {
  const utrecht = { lat: 52.0907, lng: 5.1214 };
  const cells = [
    { lat: 52.125, lng: 5.125, count: 30 }, // ~4 km
    { lat: 52.275, lng: 4.875, count: 12 }, // ~27 km, just outside
    { lat: 51.925, lng: 4.475, count: 50 }, // Rotterdam
  ];

  it("sums the anonymous cells within the radius", () => {
    expect(supplyNear(cells, utrecht)).toBe(30);
    expect(supplyNear(cells, utrecht, 40)).toBe(42);
  });

  it("rounds down to tens and hides small numbers", () => {
    expect(supplyLabel(47)).toBe("40+");
    expect(supplyLabel(20)).toBe("20+");
    expect(supplyLabel(19)).toBeNull();
    expect(supplyLabel(0)).toBeNull();
  });
});

describe("klusconcept: wat ontbreekt er nog voor de knop", () => {
  const vol = { title: "Magazijnmedewerker", city: "Groningen", date: "2026-11-20", today: "2026-11-14", hours: 7.5 };

  it("noemt de lege velden bij naam, in leesbare volgorde", () => {
    expect(conceptOntbreekt({ ...vol, title: "", city: "", date: "" })).toBe("Vul nog in: de functie (of een naam voor de klus), de plaats en een datum.");
    expect(conceptOntbreekt({ ...vol, city: " " })).toBe("Vul nog in: de plaats.");
    expect(conceptOntbreekt({ ...vol, title: "X", date: "" })).toBe("Vul nog in: de functie (of een naam voor de klus) en een datum.");
  });

  it("controleert daarna de datum en de uren, en geeft null als alles klopt", () => {
    expect(conceptOntbreekt({ ...vol, date: "2026-11-13" })).toBe("Kies een datum vanaf vandaag.");
    expect(conceptOntbreekt({ ...vol, hours: 0 })).toMatch(/eindtijd/);
    // vóór hydratie is "vandaag" nog leeg: dan telt de datum niet als verleden
    expect(conceptOntbreekt({ ...vol, today: "", date: "2020-01-01" })).toBeNull();
    expect(conceptOntbreekt(vol)).toBeNull();
  });
});
