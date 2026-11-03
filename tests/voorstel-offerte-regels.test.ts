import { describe, expect, it } from "vitest";
import { magOfferteZien, offerteKlaar } from "@/lib/voorstel/offerte-regels";

describe("offerte zien", () => {
  const a = { email: "rita@example.com", status: "offerte", bedrag: 1250 };

  it("het team ziet elke offerte, ook zonder bedrag", () => {
    expect(magOfferteZien({ ...a, status: "nieuw", bedrag: null }, { beheerder: true })).toBe(true);
  });

  it("de gast ziet alleen zijn eigen offerte, als die klaar is", () => {
    expect(magOfferteZien(a, { email: "Rita@Example.com", beheerder: false })).toBe(true);
    expect(magOfferteZien({ ...a, email: "ander@example.com", account: "rita@example.com" }, { email: "rita@example.com", beheerder: false })).toBe(true);
    expect(magOfferteZien(a, { email: "iemand@example.com", beheerder: false })).toBe(false);
    expect(magOfferteZien(a, { beheerder: false })).toBe(false);
    expect(magOfferteZien({ ...a, status: "in-behandeling" }, { email: "rita@example.com", beheerder: false })).toBe(false);
    expect(magOfferteZien({ ...a, bedrag: null }, { email: "rita@example.com", beheerder: false })).toBe(false);
  });

  it("is klaar bij offerte of geboekt met een bedrag", () => {
    expect(offerteKlaar({ status: "geboekt", bedrag: 900 })).toBe(true);
    expect(offerteKlaar({ status: "verloren", bedrag: 900 })).toBe(false);
  });
});
