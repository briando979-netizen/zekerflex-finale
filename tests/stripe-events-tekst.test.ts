import { describe, expect, it } from "vitest";
import { eventTekst, hoortBijKlant, isProbleem, isStripeId, nietAfgeleverd, perDag, perType, perVersie, type EventKern } from "@/lib/billing/stripe-events-tekst";

const NU = Date.parse("2026-11-09T12:00:00+01:00");

function event(delta: Partial<EventKern> = {}): EventKern {
  return {
    id: "evt_1",
    type: "customer.created",
    created: Math.floor(NU / 1000),
    objectId: "cus_AAAAAA1",
    objectType: "customer",
    customerId: null,
    requestId: null,
    idempotencyKey: null,
    apiVersion: "2026-08-26.dahlia",
    pendingWebhooks: 0,
    ...delta,
  };
}

describe("stripe-events-tekst", () => {
  it("geeft gewone tekst bij bekende typen en laat onbekende staan", () => {
    expect(eventTekst("payment_intent.succeeded")).toBe("Een betaling is geslaagd");
    expect(eventTekst("iets.nieuws")).toBe("iets.nieuws");
  });

  it("herkent problemen", () => {
    expect(isProbleem("payment_intent.payment_failed")).toBe(true);
    expect(isProbleem("payment_intent.succeeded")).toBe(false);
  });

  it("koppelt een event aan de klant via het object of de verwijzing", () => {
    expect(hoortBijKlant(event(), "cus_AAAAAA1")).toBe(true);
    expect(hoortBijKlant(event({ objectType: "charge", objectId: "ch_1", customerId: "cus_BBBBBB2" }), "cus_BBBBBB2")).toBe(true);
    expect(hoortBijKlant(event({ objectType: "charge", objectId: "ch_1", customerId: "cus_BBBBBB2" }), "cus_AAAAAA1")).toBe(false);
  });

  it("telt per Amsterdamse dag, ook lege dagen, oudste eerst", () => {
    const gisteren = Math.floor((NU - 86_400_000) / 1000);
    const r = perDag([event(), event({ created: gisteren }), event({ created: gisteren })], 3, NU);
    expect(r.labels).toEqual(["2026-11-07", "2026-11-08", "2026-11-09"]);
    expect(r.waarden).toEqual([0, 2, 1]);
  });

  it("past een filter toe bij het tellen per dag", () => {
    const r = perDag([event({ type: "charge.failed" }), event()], 1, NU, (e) => isProbleem(e.type));
    expect(r.waarden).toEqual([1]);
  });

  it("telt per type en per API-versie", () => {
    const lijst = [event(), event(), event({ type: "charge.failed", apiVersion: null })];
    expect(perType(lijst)).toEqual([{ type: "customer.created", aantal: 2 }, { type: "charge.failed", aantal: 1 }]);
    expect(perVersie(lijst)).toEqual([{ versie: "onbekend", aantal: 1 }, { versie: "2026-08-26.dahlia", aantal: 2 }]);
  });

  it("noemt een event pas niet afgeleverd na een uur wachten", () => {
    expect(nietAfgeleverd(event({ pendingWebhooks: 1 }), NU)).toBe(false);
    expect(nietAfgeleverd(event({ pendingWebhooks: 1, created: Math.floor((NU - 2 * 3_600_000) / 1000) }), NU)).toBe(true);
    expect(nietAfgeleverd(event({ pendingWebhooks: 0, created: Math.floor((NU - 2 * 3_600_000) / 1000) }), NU)).toBe(false);
  });

  it("accepteert alleen een echt Stripe-id", () => {
    expect(isStripeId("cus_Vb5s8PB1nOFgwe", "cus")).toBe(true);
    expect(isStripeId("cus_../../x", "cus")).toBe(false);
    expect(isStripeId("evt_Vb5s8PB1nOFgwe", "cus")).toBe(false);
  });
});
