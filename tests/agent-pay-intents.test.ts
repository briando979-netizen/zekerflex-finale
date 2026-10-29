import { describe, expect, it } from "vitest";
import {
  approvalBlock,
  approveIntent,
  DEFAULT_CAPS,
  executeIntent,
  proposeIntent,
  rejectIntent,
  type PaymentCaps,
} from "@/lib/agent-pay/intents";

const caps: PaymentCaps = { maxPerIntentCents: 25_000, maxPerDayCents: 100_000, allowExternal: true, killSwitch: false };
const base = () =>
  proposeIntent({ amountCents: 10_000, recipient: "NL00BANK0123456789", external: true, reason: "voorraad PBM", proposedBy: "ai", id: "pi_test", now: new Date("2026-10-29T10:00:00Z") });

describe("agentische betaalmotor", () => {
  it("een voorstel start als PENDING en verplaatst niets", () => {
    const i = base();
    expect(i.status).toBe("PENDING");
    expect(i.amountCents).toBe(10_000);
    expect(i.external).toBe(true);
  });

  it("weigert een voorstel zonder bedrag/ontvanger/reden", () => {
    expect(() => proposeIntent({ amountCents: 0, recipient: "x", external: false, reason: "r", proposedBy: "ai" })).toThrow();
    expect(() => proposeIntent({ amountCents: 100, recipient: "", external: false, reason: "r", proposedBy: "ai" })).toThrow();
    expect(() => proposeIntent({ amountCents: 100, recipient: "x", external: false, reason: "", proposedBy: "ai" })).toThrow();
  });

  it("DE HARDE POORT: uitvoeren kan NIET zonder goedkeuring", () => {
    const i = base();
    expect(() => executeIntent(i, caps)).toThrow(/niet goedgekeurd/i);
  });

  it("goedkeuren → uitvoeren werkt binnen de caps", () => {
    const approved = approveIntent(base(), "owner", caps, 0);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedBy).toBe("owner");
    expect(executeIntent(approved, caps).status).toBe("EXECUTED");
  });

  it("blokkeert goedkeuring boven het plafond per betaling en per dag", () => {
    const big = proposeIntent({ amountCents: 30_000, recipient: "x", external: false, reason: "r", proposedBy: "ai" });
    expect(approvalBlock(big, caps, 0)).toMatch(/plafond per betaling/i);
    const i = base(); // 10.000
    expect(approvalBlock(i, caps, 95_000)).toMatch(/dagplafond/i);
  });

  it("blokkeert externe betalingen als allowExternal uit staat", () => {
    const i = base(); // external: true
    expect(approvalBlock(i, { ...caps, allowExternal: false }, 0)).toMatch(/buiten ZekerFlex/i);
    expect(() => approveIntent(i, "owner", { ...caps, allowExternal: false }, 0)).toThrow();
  });

  it("noodknop (killSwitch) stopt goedkeuren én uitvoeren", () => {
    const i = base();
    expect(approvalBlock(i, { ...caps, killSwitch: true }, 0)).toMatch(/noodknop/i);
    const approved = approveIntent(i, "owner", caps, 0);
    expect(() => executeIntent(approved, { ...caps, killSwitch: true })).toThrow(/noodknop/i);
  });

  it("afwijzen kan alleen op PENDING", () => {
    const r = rejectIntent(base(), "owner", "niet nodig");
    expect(r.status).toBe("REJECTED");
    expect(() => rejectIntent(r, "owner")).toThrow();
  });

  it("DEFAULT_CAPS zetten extern UIT en hebben een noodknop", () => {
    expect(DEFAULT_CAPS.allowExternal).toBe(false);
    expect(DEFAULT_CAPS.killSwitch).toBe(false);
  });
});
