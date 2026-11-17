import { describe, expect, it } from "vitest";
import { leesRegels, winstPerStuk, winstUitBestellingen } from "@/lib/shop/marge";

// Marge en winst (18 nov 2026): één rekenregel voor wat een verkoop oplevert, en de
// winst uit echte bestellingen (alleen betaald of verder; wachten op betaling telt niet).

describe("winst per stuk", () => {
  it("haalt eerst de btw eraf, dan inkoop, verzending en betaalkosten", () => {
    // € 26,95 incl. → € 22,27 excl.; inkoop € 10, verzending € 4,50, betaal 1,5 % van € 26,95 = € 0,40
    const w = winstPerStuk(2695, 1000, { verzendCents: 450, betaalPct: 1.5 });
    expect(w.exclCents).toBe(2227);
    expect(w.btwCents).toBe(468);
    expect(w.betaalCents).toBe(40);
    expect(w.winstCents).toBe(2227 - 1000 - 450 - 40);
    expect(w.margePct).toBeCloseTo(((2227 - 1490) / 2227) * 100, 0);
  });

  it("zonder inkoopprijs geen marge (de winst is dan te rooskleurig en dat zie je aan null)", () => {
    const w = winstPerStuk(1995, null);
    expect(w.inkoopCents).toBe(0);
    expect(w.margePct).toBeNull();
    expect(w.winstCents).toBe(w.exclCents);
  });

  it("boeken met 9 % btw en een verliesgevend product", () => {
    expect(winstPerStuk(2195, 1000, { tarief: 0.09 }).exclCents).toBe(2014);
    expect(winstPerStuk(995, 1200).winstCents).toBeLessThan(0);
  });
});

describe("winst uit bestellingen", () => {
  const kosten = (id: string) => (id === "a" ? { inkoopCents: 1000, verzendCents: 450 } : { inkoopCents: null, verzendCents: 0 });
  const bestellingen = [
    { status: "SHIPPED", itemsJson: [{ productId: "a", priceCents: 2695, qty: 2 }, { productId: "b", priceCents: 1000, qty: 1 }] },
    { status: "CONFIRMED", itemsJson: [{ productId: "a", priceCents: 2695, qty: 1 }] },
    { status: "PENDING_PAYMENT", itemsJson: [{ productId: "a", priceCents: 2695, qty: 9 }] },
    { status: "CANCELLED", itemsJson: [{ productId: "a", priceCents: 2695, qty: 9 }] },
    { status: "SHIPPED", itemsJson: "kapot" },
  ];

  it("telt alleen betaalde bestellingen en rekent per regel", () => {
    const t = winstUitBestellingen(bestellingen, kosten);
    expect(t.bestellingen).toBe(2);
    expect(t.stuks).toBe(4);
    expect(t.omzetCents).toBe(2695 * 3 + 1000);
    expect(t.inkoopCents).toBe(3000);
    const perStukA = winstPerStuk(2695, 1000, { verzendCents: 450 }).winstCents;
    const perStukB = winstPerStuk(1000, null).winstCents;
    expect(t.winstCents).toBe(perStukA * 3 + perStukB);
    expect(t.perProduct.map((p) => p.productId)).toEqual(["a", "b"]);
    expect(t.perProduct[0]).toEqual({ productId: "a", stuks: 3, omzetCents: 2695 * 3, winstCents: perStukA * 3 });
  });

  it("leest kapotte regels soepel", () => {
    expect(leesRegels([{ productId: "x", priceCents: "9", qty: 1 }, { productId: "", priceCents: 9 }, { productId: "y", priceCents: 500 }, null])).toEqual([{ productId: "y", priceCents: 500, qty: 1 }]);
    expect(leesRegels({})).toEqual([]);
  });
});
