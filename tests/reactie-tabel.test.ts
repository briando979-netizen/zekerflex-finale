import { describe, expect, it } from "vitest";
import { kostenIndicatie, selectieStand, sorteerReacties, tegenbod, verlooptOver, volgendeSortering, type ReactieVoorSortering } from "@/lib/werkgever/reactie-tabel";
import { filterReacties, filtersActief, LEGE_FILTERS, voldoetAanFilters, type ReactieVoorFilter } from "@/lib/werkgever/reactie-filters";

// De reactietabel op de kluspagina van een bedrijf (23 nov 2026): sorteren, de regels van de drie knoppen, de aftelling tot een
// reactie vervalt, het tegenbod en de kostenindicatie. Plus de nieuwe filters (zelf gewerkt, sector, functie, KVK).

const r = (naam: string, p: Partial<ReactieVoorSortering> = {}): ReactieVoorSortering => ({
  naam,
  reviewAverage: 4.5,
  reviewCount: 10,
  compleetPct: 95,
  urenBijBedrijf: 0,
  proposedRateCents: 1800,
  ...p,
});

describe("sorteerReacties", () => {
  const rijen = [r("Sanne", { reviewAverage: 4.6, compleetPct: 98, proposedRateCents: 2000 }), r("Ali", { reviewCount: 0, reviewAverage: 0, compleetPct: null, urenBijBedrijf: 12 }), r("Mila", { reviewAverage: 5, compleetPct: 100 })];

  it("sorteert op beoordeling in beide richtingen; wie geen beoordeling heeft staat altijd onderaan", () => {
    expect(sorteerReacties(rijen, "beoordeling", "af").map((x) => x.naam)).toEqual(["Mila", "Sanne", "Ali"]);
    expect(sorteerReacties(rijen, "beoordeling", "op").map((x) => x.naam)).toEqual(["Sanne", "Mila", "Ali"]);
  });

  it("sorteert op opkomst, uren, tarief en naam", () => {
    expect(sorteerReacties(rijen, "opkomst", "af").map((x) => x.naam)).toEqual(["Mila", "Sanne", "Ali"]);
    expect(sorteerReacties(rijen, "uren", "af").map((x) => x.naam)).toEqual(["Ali", "Sanne", "Mila"]);
    expect(sorteerReacties(rijen, "tarief", "op").map((x) => x.naam)).toEqual(["Ali", "Mila", "Sanne"]);
    expect(sorteerReacties(rijen, "naam", "op").map((x) => x.naam)).toEqual(["Ali", "Mila", "Sanne"]);
  });

  it("laat de lijst zelf met rust en keert om bij een tweede klik op dezelfde kolom", () => {
    sorteerReacties(rijen, "naam", "op");
    expect(rijen.map((x) => x.naam)).toEqual(["Sanne", "Ali", "Mila"]);
    expect(volgendeSortering(null, "beoordeling")).toEqual({ kolom: "beoordeling", richting: "af" });
    expect(volgendeSortering({ kolom: "beoordeling", richting: "af" }, "beoordeling")).toEqual({ kolom: "beoordeling", richting: "op" });
    expect(volgendeSortering({ kolom: "beoordeling", richting: "op" }, "naam")).toEqual({ kolom: "naam", richting: "op" });
  });
});

describe("selectieStand: wat mag met de gekozen reacties", () => {
  it("niets gekozen: alle knoppen uit", () => {
    expect(selectieStand(0, 2, true)).toEqual({ teVeel: 0, magAccepteren: false, magReserve: false, magWeigeren: false });
  });

  it("past binnen de plekken: alles mag", () => {
    expect(selectieStand(2, 2, true)).toEqual({ teVeel: 0, magAccepteren: true, magReserve: true, magWeigeren: true });
  });

  it("meer gekozen dan plekken: de melding telt hoeveel te veel, accepteren kan niet, reservebank en weigeren wel", () => {
    expect(selectieStand(5, 1, true)).toEqual({ teVeel: 4, magAccepteren: false, magReserve: true, magWeigeren: true });
    expect(selectieStand(1, 0, true)).toMatchObject({ teVeel: 1, magAccepteren: false });
  });

  it("de reservebank is dicht (klus begonnen, of niet het bedrijf zelf): die knop blijft uit", () => {
    expect(selectieStand(1, 3, false)).toMatchObject({ magAccepteren: true, magReserve: false, magWeigeren: true });
  });
});

describe("verlooptOver, tegenbod en kostenindicatie", () => {
  const start = "2026-12-08T09:00:00+01:00";

  it("een reactie vervalt 2 uur na de start van de klus", () => {
    expect(verlooptOver(start, new Date("2026-11-23T17:00:00+01:00").getTime())).toEqual({ dagen: 14, uren: 18 });
    expect(verlooptOver(start, new Date("2026-12-08T08:30:00+01:00").getTime())).toEqual({ dagen: 0, uren: 2 });
    expect(verlooptOver(start, new Date("2026-12-08T10:30:00+01:00").getTime())).toEqual({ dagen: 0, uren: 0 });
    expect(verlooptOver(start, new Date("2026-12-08T11:00:00+01:00").getTime())).toBeNull();
    expect(verlooptOver("geen datum", 0)).toBeNull();
  });

  it("een tegenbod is hoger of lager dan het geplaatste tarief", () => {
    expect(tegenbod(2000, 1800)).toBe("hoger");
    expect(tegenbod(1700, 1800)).toBe("lager");
    expect(tegenbod(1800, 1800)).toBeNull();
  });

  it("de kostenindicatie is het tarief maal de uren plus de platformkosten per uur", () => {
    expect(kostenIndicatie(1800, 5.5, 350)).toBe(9900 + 1925);
    expect(kostenIndicatie(2000, 8, 0)).toBe(16000);
    expect(kostenIndicatie(2000, -1, 350)).toBe(0);
  });
});

describe("de nieuwe filters", () => {
  const f = (p: Partial<ReactieVoorFilter> = {}): ReactieVoorFilter => ({
    favoriet: false,
    attendancePct: 92,
    shiftsCompleted: 14,
    reviewAverage: 4.6,
    reviewCount: 9,
    proposedRateCents: 1800,
    listedRateCents: 1800,
    zelfPct: 80,
    zelfdeSector: true,
    zelfdeFunctie: false,
    kvk: true,
    ...p,
  });

  it("minimaal zelf gewerkt: zonder cijfer (nieuw) valt weg zodra er een minimum staat", () => {
    const min = { ...LEGE_FILTERS, minZelf: 90 };
    expect(voldoetAanFilters(f({ zelfPct: 95 }), min)).toBe(true);
    expect(voldoetAanFilters(f({ zelfPct: 80 }), min)).toBe(false);
    expect(voldoetAanFilters(f({ zelfPct: null }), min)).toBe(false);
    expect(voldoetAanFilters(f({ zelfPct: null }), LEGE_FILTERS)).toBe(true);
  });

  it("ervaring in dezelfde sector of functie en in bezit van KVK", () => {
    expect(voldoetAanFilters(f(), { ...LEGE_FILTERS, zelfdeSector: true })).toBe(true);
    expect(voldoetAanFilters(f(), { ...LEGE_FILTERS, zelfdeFunctie: true })).toBe(false);
    expect(voldoetAanFilters(f({ kvk: false }), { ...LEGE_FILTERS, kvk: true })).toBe(false);
    expect(voldoetAanFilters(f({ kvk: true }), { ...LEGE_FILTERS, kvk: true })).toBe(true);
  });

  it("telt de nieuwe filters mee en zegt hoeveel reacties verborgen zijn", () => {
    const filters = { ...LEGE_FILTERS, kvk: true, zelfdeSector: true, minZelf: 50 };
    expect(filtersActief(filters)).toBe(3);
    const { zichtbaar, verborgen } = filterReacties([f(), f({ kvk: false }), f({ zelfdeSector: false })], filters);
    expect(zichtbaar).toHaveLength(1);
    expect(verborgen).toBe(2);
  });
});
