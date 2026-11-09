import { describe, expect, it } from "vitest";
import { evaluatePayoutGate, type PayoutGateInput } from "@/lib/billing/payout-gate";

const OK: PayoutGateInput = { timesheetApproved: true, freelancerKvkValid: true, freelancerVatValid: true, disputeOpen: false };

describe("uitbetalingspoort", () => {
  it("geeft vrij als alle drie de poten kloppen en er geen geschil is", () => {
    expect(evaluatePayoutGate(OK)).toEqual({ released: true, reasons: [] });
  });

  it.each([
    [{ timesheetApproved: false }, "urenstaat is niet goedgekeurd"],
    [{ freelancerKvkValid: false }, "KVK-status is niet geldig"],
    [{ freelancerVatValid: false }, "btw-status is niet geldig"],
    [{ disputeOpen: true }, "er staat een geschil open"],
  ] as const)("blokkeert op precies één reden: %j", (patch, reden) => {
    const r = evaluatePayoutGate({ ...OK, ...patch });
    expect(r.released).toBe(false);
    expect(r.reasons).toEqual([reden]);
  });

  it("noemt alle redenen tegelijk, in vaste volgorde", () => {
    const r = evaluatePayoutGate({ timesheetApproved: false, freelancerKvkValid: false, freelancerVatValid: false, disputeOpen: true });
    expect(r.released).toBe(false);
    expect(r.reasons).toEqual([
      "urenstaat is niet goedgekeurd",
      "KVK-status is niet geldig",
      "btw-status is niet geldig",
      "er staat een geschil open",
    ]);
  });
});
