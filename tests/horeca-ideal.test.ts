import { describe, expect, it } from "vitest";
import type { BestelRegel } from "@/lib/horeca/bestellen";
import { methodeLabel, rekeningVan } from "@/lib/horeca/kassa";
import { beschikbaar, boekAf, bonRegels, fooiGeldig, idealRegels, kiesRegels, kostenVooraf, leesIdealRegels, MAX_FOOI_CENT, onlineMethode, terugNaarZaak } from "@/lib/horeca/ideal";

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

  it("laat niet kiezen wat een ander aan tafel al aan het betalen is", () => {
    const rekening = rekeningVan(bestellingen());
    const ander = [{ naam: "Burger", prijsCent: 1795, aantal: 1, btw: 9, bestellingId: "b1", index: 0 }];
    const open = beschikbaar(rekening, ander);
    expect(open.find((r) => r.naam === "Burger")?.aantal).toBe(1);
    expect(beschikbaar(rekening, [...ander, ...ander]).find((r) => r.naam === "Burger")).toBeUndefined();
    expect(beschikbaar(rekening, [])).toEqual(rekening);
  });

  it("maakt van een eigen keuze de regels van één betaling", () => {
    const open = rekeningVan(bestellingen());
    const regels = kiesRegels(open, [
      { bestellingId: "b1", index: 1, aantal: 1 },
      { bestellingId: "b1", index: 1, aantal: 1 },
      { bestellingId: "b2", index: 0, aantal: 1 },
    ]);
    expect(regels).toEqual([
      { naam: "Pils", prijsCent: 395, aantal: 2, btw: 21, bestellingId: "b1", index: 1 },
      { naam: "Koffie", prijsCent: 290, aantal: 1, btw: 9, bestellingId: "b2", index: 0 },
    ]);
    // en na betaling boekt precies die keuze af
    const uit = boekAf(bestellingen(), regels as ReturnType<typeof idealRegels>);
    expect(uit.ok && uit.wijzigingen.find((w) => w.id === "b1")?.helemaal).toBe(false);
  });

  it("weigert een keuze die niet (meer) open staat", () => {
    const open = rekeningVan(bestellingen());
    expect(kiesRegels(open, [{ bestellingId: "b1", index: 1, aantal: 3 }])).toEqual({ fout: "Van Pils staat nog 2 open." });
    expect(kiesRegels(open, [{ bestellingId: "b3", index: 0, aantal: 1 }])).toEqual({ fout: "Een gerecht staat niet meer open. Ververs de rekening." });
    expect(kiesRegels(open, [])).toEqual({ fout: "Kies wat je wilt betalen." });
    expect(kiesRegels(open, [{ bestellingId: "b2", index: 0, aantal: 0 }])).toEqual({ fout: "Kies hoeveel je van elk gerecht betaalt." });
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

describe("betaalwijze en kosten aan tafel", () => {
  it("houdt vooraf genoeg in voor de duurste pas, en minstens de iDEAL-kosten", () => {
    expect(kostenVooraf(500, 29)).toBe(42); // € 5: 3,25% = 16,25 → 17 + 25
    expect(kostenVooraf(4250, 29)).toBe(164); // € 42,50: 138,125 → 139 + 25
    expect(kostenVooraf(100, 29)).toBe(29); // € 1: 4 + 25 = 29
    expect(kostenVooraf(10, 29)).toBe(29);
  });

  it("stort het verschil met de echte kosten terug, nooit meer dan er over is", () => {
    expect(terugNaarZaak(164, 89, 0)).toBe(75); // Nederlandse pas: 1,5% + € 0,25 = € 0,89
    expect(terugNaarZaak(164, 29, 0)).toBe(135); // toch iDEAL
    expect(terugNaarZaak(164, 89, 75)).toBe(0); // al teruggestort (webhook kwam twee keer)
    expect(terugNaarZaak(164, 200, 0)).toBe(0); // duurder dan gedacht: niets terug
  });

  it("leest de betaalwijze uit Stripe", () => {
    expect(onlineMethode({ type: "ideal" })).toBe("ideal");
    expect(onlineMethode({ type: "card", card: { wallet: { type: "apple_pay" } } })).toBe("apple_pay");
    expect(onlineMethode({ type: "card", card: { wallet: { type: "google_pay" } } })).toBe("google_pay");
    expect(onlineMethode({ type: "card", card: { wallet: null } })).toBe("kaart");
    expect(onlineMethode(null)).toBe("ideal");
  });

  it("de bon noemt de echte betaalwijze", () => {
    expect(methodeLabel("apple_pay")).toBe("Apple Pay");
    expect(methodeLabel("kaart")).toBe("Pas");
    expect(methodeLabel("ideal")).toBe("iDEAL");
    expect(methodeLabel("pin")).toBe("Pin");
    expect(methodeLabel("constructor")).toBe("constructor");
  });
});
