import { describe, expect, it } from "vitest";
import { nooitUitbetaaldLoonvoorschot, voorschottenVoorWerker } from "@/lib/payouts/voorschot-zicht";

// De vormen zoals ze op prod staan (12 nov): FAILED met status requested (betaalopdracht mislukt) en met status
// approved (geen IBAN), beide zonder referentie en zonder betaaldatum.
const mislukt = { id: "a", kind: "payroll" as const, payoutStatus: "FAILED", providerRef: null, status: "requested" };
const geenIban = { id: "b", kind: "payroll" as const, payoutStatus: "FAILED", providerRef: null, status: "approved" };

describe("voorschotten die de werker ziet", () => {
  it("verbergt een loonvoorschot dat nooit is uitbetaald", () => {
    expect(nooitUitbetaaldLoonvoorschot(mislukt)).toBe(true);
    expect(nooitUitbetaaldLoonvoorschot(geenIban)).toBe(true);
  });

  it("toont een uitbetaald of lopend loonvoorschot", () => {
    expect(nooitUitbetaaldLoonvoorschot({ kind: "payroll", payoutStatus: "SUBMITTED", providerRef: "sepa_1", paidAt: "2026-11-02T09:01:00.000Z" })).toBe(false);
    expect(nooitUitbetaaldLoonvoorschot({ kind: "payroll", payoutStatus: "PENDING", providerRef: null })).toBe(false);
  });

  it("toont een FAILED-regel waar wel een betaalreferentie of betaaldatum bij staat (dan is er iets gebeurd)", () => {
    expect(nooitUitbetaaldLoonvoorschot({ ...mislukt, providerRef: "sepa_9" })).toBe(false);
    expect(nooitUitbetaaldLoonvoorschot({ ...mislukt, paidAt: new Date("2026-11-02T10:01:00+01:00") })).toBe(false);
  });

  it("laat een gewoon voorschot (zonder soort of handmatig) altijd staan", () => {
    expect(nooitUitbetaaldLoonvoorschot({ payoutStatus: "FAILED" })).toBe(false);
    expect(nooitUitbetaaldLoonvoorschot({ kind: "manual", payoutStatus: "FAILED", providerRef: null })).toBe(false);
  });

  it("filtert de lijst en houdt de volgorde", () => {
    const goed1 = { id: "c", kind: "payroll" as const, payoutStatus: "SETTLED", providerRef: "sepa_2", paidAt: "2026-11-03T09:00:00.000Z" };
    const goed2 = { id: "d", kind: "manual" as const };
    expect(voorschottenVoorWerker([goed1, mislukt, goed2, geenIban]).map((a) => a.id)).toEqual(["c", "d"]);
  });
});
