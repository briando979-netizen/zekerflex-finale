import { bedrijfOk } from "@/lib/fiscal/bedrijf-ok";

export interface PayoutGateInput {
  timesheetApproved: boolean;
  freelancerKvkValid: boolean;
  freelancerVatValid: boolean;
  /** de werker gebruikt de kleineondernemersregeling (lib/fiscal/store.ts, korApplies) */
  freelancerKor: boolean;
  disputeOpen: boolean;
}

export interface PayoutGateResult {
  released: boolean;
  reasons: string[];
}

/**
 * Payout release is deliberately stricter than invoice creation. Every leg of
 * the three-way match must be true before money can leave the platform.
 * Het bedrijf van de werker telt sinds 21 nov 2026 met dezelfde regel als reageren (lib/fiscal/bedrijf-ok.ts): een geldig
 * KVK-nummer, óf een geldig btw-nummer, óf de KOR. Tot dan eiste deze poort KVK én btw, en kon een werker met de KOR of met
 * alleen een EU-btw-nummer nooit uitbetaald worden.
 */
export function evaluatePayoutGate(input: PayoutGateInput): PayoutGateResult {
  const reasons: string[] = [];
  if (!input.timesheetApproved) reasons.push("urenstaat is niet goedgekeurd");
  if (!bedrijfOk({ kvkValid: input.freelancerKvkValid, vatValid: input.freelancerVatValid }, { korApplies: input.freelancerKor })) {
    reasons.push("geen geldig KVK-nummer, btw-nummer of KOR");
  }
  if (input.disputeOpen) reasons.push("er staat een geschil open");
  return { released: reasons.length === 0, reasons };
}
