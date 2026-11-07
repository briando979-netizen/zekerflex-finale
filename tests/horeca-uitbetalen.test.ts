import { describe, expect, it } from "vitest";
import { euroUit, isAutomatisch, leesBedrag, opneemBedrag, statusTekst } from "@/lib/horeca/uitbetalen-kern";

// Het geld van een horecazaak staat op haar eigen Stripe-account; zij kiest
// automatisch uitbetalen (elke werkdag) of zelf opnemen (lib/horeca/uitbetalen.ts).
describe("uitbetalen voor een horecazaak", () => {
  it("telt alleen euro's uit het saldo van Stripe", () => {
    expect(euroUit([{ amount: 12_550, currency: "eur" }, { amount: 999, currency: "usd" }, { amount: 50, currency: "EUR" }])).toBe(12_600);
    expect(euroUit(null)).toBe(0);
  });

  it("alles behalve 'manual' is automatisch", () => {
    expect(isAutomatisch("daily")).toBe(true);
    expect(isAutomatisch("weekly")).toBe(true);
    expect(isAutomatisch(undefined)).toBe(true);
    expect(isAutomatisch("manual")).toBe(false);
  });

  it("neemt alles op als er geen bedrag is, of precies het gevraagde", () => {
    expect(opneemBedrag(null, 12_550)).toEqual({ ok: true, bedragCent: 12_550 });
    expect(opneemBedrag(5_000, 12_550)).toEqual({ ok: true, bedragCent: 5_000 });
  });

  it("weigert te veel, te weinig of als er niets klaarstaat, met een uitleg", () => {
    expect(opneemBedrag(20_000, 12_550)).toEqual({ ok: false, fout: "Je kunt hooguit € 125,50 opnemen." });
    expect(opneemBedrag(50, 12_550)).toMatchObject({ ok: false });
    expect(opneemBedrag(null, 40)).toMatchObject({ ok: false });
  });

  it("leest een bedrag zoals mensen het typen", () => {
    expect(leesBedrag("125,50")).toBe(12_550);
    expect(leesBedrag("€ 12")).toBe(1_200);
    expect(leesBedrag("12.5")).toBe(1_250);
    expect(leesBedrag("")).toBeNull();
    expect(leesBedrag("twaalf")).toBe("fout");
  });

  it("zegt de stand van een uitbetaling in het Nederlands", () => {
    expect(statusTekst("paid")).toBe("Op je rekening");
    expect(statusTekst("in_transit")).toBe("Onderweg");
    expect(statusTekst("constructor")).toBe("constructor");
  });
});
