import { describe, expect, it } from "vitest";
import { BETALEN_UIT_VERWIJZING, betalenUitEerst, betalenUitVoorzin, webhookHandtekeningStand, type StripeStand } from "@/lib/admin/todo-stripe-wissel";
import { stripeAccountTodos } from "@/lib/admin/todo-stripe-account";
import type { StripeAccountInfo } from "@/lib/billing/stripe-account-vorm";

// Na de wissel naar Zekerflex, Inc. blijft stripe-account-inc de ene geld-binnen-taak. De webhook-handtekening-taak is
// achterhaald zodra het actieve account een eigen webhook heeft; "betalen uit" telt alleen apart mee als er een actief
// account is. Een leesfout (undefined) verandert niets.

const actief = (o: Partial<StripeAccountInfo> = {}): StripeAccountInfo => ({
  accountId: "acct_test",
  naam: "Zekerflex, Inc.",
  land: "US",
  eind: "abcd",
  ingesteldOp: "2026-11-14T09:00:00.000Z",
  door: "eigenaar",
  webhook: true,
  connectWebhook: true,
  connectMelding: null,
  heeftVorige: true,
  ...o,
});

describe("stripe-webhook-handtekening", () => {
  it("actief account met webhook: achterhaald (afgevinkt), met een uitleg", () => {
    const r = webhookHandtekeningStand(actief({ webhook: true }));
    expect(r.achterhaald).toBe(true);
    expect(r.doneNote).toContain("eigen webhook");
  });

  it("actief account zonder webhook: de taak blijft", () => {
    expect(webhookHandtekeningStand(actief({ webhook: false })).achterhaald).toBe(false);
  });

  it("geen actief account (null): de taak blijft", () => {
    expect(webhookHandtekeningStand(null).achterhaald).toBe(false);
  });

  it("een leesfout (undefined): ongewijzigd, dus de taak blijft", () => {
    const stand: StripeStand = undefined;
    expect(webhookHandtekeningStand(stand)).toEqual({ achterhaald: false });
  });
});

describe("stripe-betalen-uit", () => {
  it("met een actief account telt hij als geld binnen (een echt probleem met dat account)", () => {
    expect(betalenUitEerst(actief())).toEqual({ reden: "geld binnen" });
    expect(betalenUitVoorzin(actief())).toBe("");
  });

  it("zonder actief account is stripe-account-inc de ene geld-binnen-taak: geen eerst, met een verwijzing", () => {
    expect(betalenUitEerst(null)).toBeUndefined();
    expect(betalenUitVoorzin(null)).toBe(BETALEN_UIT_VERWIJZING);
    expect(BETALEN_UIT_VERWIJZING).toContain("Zekerflex, Inc.");
  });

  it("een leesfout (undefined): ongewijzigd, dus eerst blijft zoals het was", () => {
    expect(betalenUitEerst(undefined)).toEqual({ reden: "geld binnen" });
    expect(betalenUitVoorzin(undefined)).toBe("");
  });
});

describe("stripe-account-inc blijft de ene geld-binnen-taak", () => {
  it("geen actief account: de taak is open en heeft eerst", () => {
    const [t] = stripeAccountTodos(null);
    expect(t?.id).toBe("stripe-account-inc");
    expect(t?.done).toBe(false);
    expect(t?.eerst?.reden).toBe("geld binnen");
  });

  it("actief account: afgevinkt, dus uit het blok Begin hier", () => {
    const [t] = stripeAccountTodos(actief());
    expect(t?.done).toBe(true);
  });

  it("een leesfout: geen taak (niets vals tonen)", () => {
    expect(stripeAccountTodos(undefined)).toEqual([]);
  });
});
