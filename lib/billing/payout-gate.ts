export interface PayoutGateInput {
  timesheetApproved: boolean;
  freelancerKvkValid: boolean;
  freelancerVatValid: boolean;
  disputeOpen: boolean;
}

export interface PayoutGateResult {
  released: boolean;
  reasons: string[];
}

/**
 * Payout release is deliberately stricter than invoice creation. Every leg of
 * the three-way match must be true before money can leave the platform.
 */
export function evaluatePayoutGate(input: PayoutGateInput): PayoutGateResult {
  const reasons: string[] = [];
  if (!input.timesheetApproved) reasons.push("urenstaat is niet goedgekeurd");
  if (!input.freelancerKvkValid) reasons.push("KVK-status is niet geldig");
  if (!input.freelancerVatValid) reasons.push("btw-status is niet geldig");
  if (input.disputeOpen) reasons.push("er staat een geschil open");
  return { released: reasons.length === 0, reasons };
}
