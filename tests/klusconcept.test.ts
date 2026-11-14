import { describe, expect, it } from "vitest";
import { canPostShift, conceptCost, conceptHours, conceptOntbreekt, klusUrl, parseConcept, SECTOR_TEMPLATE, supplyLabel, supplyNear, toShiftFormValues, type KlusConcept } from "@/lib/klusconcept/concept";
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
    const templateKeys = ["vakkenvuller", "kassa", "magazijn", "schoonmaak", "horeca", "receptie"];
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
