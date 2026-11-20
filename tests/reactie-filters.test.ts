import { describe, expect, it } from "vitest";
import { filterReacties, filtersActief, LEGE_FILTERS, voldoetAanFilters, type ReactieVoorFilter } from "@/lib/werkgever/reactie-filters";

// Filters op de reacties van een klus (20 nov 2026, naar YoungOnes): wie geen cijfer heeft valt alleen weg bij een minimum.

const r = (p: Partial<ReactieVoorFilter> = {}): ReactieVoorFilter => ({
  favoriet: false,
  attendancePct: 92,
  shiftsCompleted: 14,
  reviewAverage: 4.6,
  reviewCount: 9,
  proposedRateCents: 1800,
  listedRateCents: 1800,
  ...p,
});

describe("reactie-filters", () => {
  it("zonder filters blijft alles staan", () => {
    const { zichtbaar, verborgen } = filterReacties([r(), r({ attendancePct: null, reviewCount: 0 })], LEGE_FILTERS);
    expect(zichtbaar).toHaveLength(2);
    expect(verborgen).toBe(0);
    expect(filtersActief(LEGE_FILTERS)).toBe(0);
  });

  it("minimale opkomst: zonder cijfer (nieuw) valt weg, erboven blijft", () => {
    const f = { ...LEGE_FILTERS, minOpkomst: 90 };
    expect(voldoetAanFilters(r({ attendancePct: 92 }), f)).toBe(true);
    expect(voldoetAanFilters(r({ attendancePct: 85 }), f)).toBe(false);
    expect(voldoetAanFilters(r({ attendancePct: null }), f)).toBe(false);
  });

  it("favoriet, klussen, sterren en tegenbod", () => {
    expect(voldoetAanFilters(r({ favoriet: false }), { ...LEGE_FILTERS, favoriet: true })).toBe(false);
    expect(voldoetAanFilters(r({ favoriet: true }), { ...LEGE_FILTERS, favoriet: true })).toBe(true);
    expect(voldoetAanFilters(r({ shiftsCompleted: 3 }), { ...LEGE_FILTERS, minKlussen: 5 })).toBe(false);
    expect(voldoetAanFilters(r({ reviewCount: 0, reviewAverage: 0 }), { ...LEGE_FILTERS, minSterren: 4 })).toBe(false);
    expect(voldoetAanFilters(r({ reviewAverage: 4.7 }), { ...LEGE_FILTERS, minSterren: 4.5 })).toBe(true);
    expect(voldoetAanFilters(r({ proposedRateCents: 2000 }), { ...LEGE_FILTERS, geenTegenbod: true })).toBe(false);
  });

  it("telt wat verborgen is en hoeveel filters aan staan", () => {
    const f = { ...LEGE_FILTERS, favoriet: true, minSterren: 4 };
    const { zichtbaar, verborgen } = filterReacties([r({ favoriet: true }), r(), r({ favoriet: true, reviewAverage: 3.2 })], f);
    expect(zichtbaar).toHaveLength(1);
    expect(verborgen).toBe(2);
    expect(filtersActief(f)).toBe(2);
  });
});
