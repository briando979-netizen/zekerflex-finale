import { describe, expect, it } from "vitest";
import { evaluatePayoutGate, type PayoutGateInput } from "@/lib/billing/payout-gate";

const OK: PayoutGateInput = { timesheetApproved: true, freelancerKvkValid: true, freelancerVatValid: true, freelancerKor: false, disputeOpen: false };
const GEEN_BEDRIJF = { freelancerKvkValid: false, freelancerVatValid: false, freelancerKor: false };

// Sinds 21 nov 2026 telt het bedrijf van de werker met dezelfde regel als reageren (lib/fiscal/bedrijf-ok.ts): KVK, óf btw,
// óf de KOR. Tot dan blokkeerde een ontbrekend KVK- of btw-nummer elk apart; die verwachting is daarom aangepast: alleen
// KVK of alleen btw blokkeert niet meer, pas als alle drie ontbreken.
describe("uitbetalingspoort", () => {
  it("geeft vrij als alle poten kloppen en er geen geschil is", () => {
    expect(evaluatePayoutGate(OK)).toEqual({ released: true, reasons: [] });
  });

  it("KVK, btw of KOR: één van de drie is genoeg", () => {
    expect(evaluatePayoutGate({ ...OK, ...GEEN_BEDRIJF, freelancerKvkValid: true }).released).toBe(true);
    expect(evaluatePayoutGate({ ...OK, ...GEEN_BEDRIJF, freelancerVatValid: true }).released).toBe(true);
    expect(evaluatePayoutGate({ ...OK, ...GEEN_BEDRIJF, freelancerKor: true }).released).toBe(true);
  });

  it.each([
    [{ timesheetApproved: false }, "urenstaat is niet goedgekeurd"],
    [GEEN_BEDRIJF, "geen geldig KVK-nummer, btw-nummer of KOR"],
    [{ disputeOpen: true }, "er staat een geschil open"],
  ] as const)("blokkeert op precies één reden: %j", (patch, reden) => {
    const r = evaluatePayoutGate({ ...OK, ...patch });
    expect(r.released).toBe(false);
    expect(r.reasons).toEqual([reden]);
  });

  it("noemt alle redenen tegelijk, in vaste volgorde", () => {
    const r = evaluatePayoutGate({ timesheetApproved: false, ...GEEN_BEDRIJF, disputeOpen: true });
    expect(r.released).toBe(false);
    expect(r.reasons).toEqual(["urenstaat is niet goedgekeurd", "geen geldig KVK-nummer, btw-nummer of KOR", "er staat een geschil open"]);
  });
});
