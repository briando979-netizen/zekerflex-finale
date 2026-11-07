import { describe, expect, it } from "vitest";
import type { BestelRegel } from "@/lib/horeca/bestellen";
import { rekeningVan } from "@/lib/horeca/kassa";
import { boekAf, bonRegels, fooiGeldig, idealRegels, leesIdealRegels, MAX_FOOI_CENT } from "@/lib/horeca/ideal";

const regel = (naam: string, prijsCent: number, aantal: number, extra: Partial<BestelRegel> = {}): BestelRegel => ({ itemId: naam, naam, prijsCent, aantal, opmerking: "", station: "keuken", ...extra });

const bestellingen = () => [
  { id: "b1", nummer: 1, status: "GESERVEERD", betaald: false, regels: [regel("Burger", 1795, 2, { btw: 9 }), regel("Pils", 395, 3, { btw: 21, station: "bar", betaaldAantal: 1 })] },
  { id: "b2", nummer: 2, status: "NIEUW", betaald: false, regels: [regel("Koffie", 290, 1)] },
  { id: "b3", nummer: 3, status: "GEANNULEERD", betaald: false, regels: [regel("Soep", 695, 1)] },
];

describe("iDEAL aan tafel", () => {
  it("neemt alles wat open staat, zonder geannuleerd of al betaald", () => {
    const r = idealRegels(rekeningVan(bestellingen()));
    expect(r).toEqual([
      { naam: "Burger", prijsCent: 1795, aantal: 2, btw: 9, bestellingId: "b1", index: 0 },
      { naam: "Pils", prijsCent: 395, aantal: 2, btw: 21, bestellingId: "b1", index: 1 },
      { naam: "Koffie", prijsCent: 290, aantal: 1, btw: 9, bestellingId: "b2", index: 0 },
    ]);
    expect(bonRegels(r)[1]).toEqual({ naam: "Pils", prijsCent: 395, aantal: 2, btw: 21 });
  });

  it("boekt na betaling alles af en zet de bestellingen op betaald", () => {
    const lijst = bestellingen();
    const uit = boekAf(lijst, idealRegels(rekeningVan(lijst)));
    expect(uit.ok).toBe(true);
    if (!uit.ok) return;
    expect(uit.wijzigingen.map((w) => [w.id, w.helemaal])).toEqual([
      ["b1", true],
      ["b2", true],
    ]);
    expect(uit.wijzigingen[0]?.regels[1]?.betaaldAantal).toBe(3);
  });

  it("boekt niets af als de bediening intussen al afrekende", () => {
    const lijst = bestellingen();
    const regels = idealRegels(rekeningVan(lijst));
    const later = lijst.map((b) => (b.id === "b2" ? { ...b, betaald: true } : b));
    expect(boekAf(later, regels)).toEqual({ ok: false, fout: "Deze rekening was intussen al afgerekend." });
    const deels = lijst.map((b) => (b.id === "b1" ? { ...b, regels: [regel("Burger", 1795, 2, { betaaldAantal: 1 }), ...b.regels.slice(1)] } : b));
    const fout = boekAf(deels, regels);
    expect(fout.ok).toBe(false);
  });

  it("boekt niets af bij een verdwenen of geannuleerde bestelling", () => {
    const lijst = bestellingen();
    const regels = idealRegels(rekeningVan(lijst));
    expect(boekAf(lijst.filter((b) => b.id !== "b2"), regels).ok).toBe(false);
    expect(boekAf(lijst.map((b) => (b.id === "b2" ? { ...b, status: "GEANNULEERD" } : b)), regels).ok).toBe(false);
    expect(boekAf(lijst, []).ok).toBe(false);
  });

  it("leest vastgelegde regels soepel terug", () => {
    const opgeslagen: unknown = [
      { naam: "Burger", prijsCent: 1795, aantal: 2, btw: 9, bestellingId: "b1", index: 0 },
      { naam: "Kapot", prijsCent: "12", aantal: 1, bestellingId: "b1", index: 1 },
      { naam: "Zonder btw", prijsCent: 100, aantal: 1, bestellingId: "b2", index: 0 },
      null,
    ];
    expect(leesIdealRegels(opgeslagen)).toEqual([
      { naam: "Burger", prijsCent: 1795, aantal: 2, btw: 9, bestellingId: "b1", index: 0 },
      { naam: "Zonder btw", prijsCent: 100, aantal: 1, btw: 9, bestellingId: "b2", index: 0 },
    ]);
    expect(leesIdealRegels({ niet: "een lijst" })).toEqual([]);
  });

  it("accepteert alleen een redelijke fooi", () => {
    expect(fooiGeldig(0, 2500)).toBe(true);
    expect(fooiGeldig(250, 2500)).toBe(true);
    expect(fooiGeldig(2500, 2500)).toBe(true);
    expect(fooiGeldig(2501, 2500)).toBe(false);
    expect(fooiGeldig(MAX_FOOI_CENT + 1, 1_000_000)).toBe(false);
    expect(fooiGeldig(-1, 2500)).toBe(false);
    expect(fooiGeldig(12.5, 2500)).toBe(false);
    expect(fooiGeldig("100", 2500)).toBe(false);
  });
});
