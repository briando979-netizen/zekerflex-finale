import { describe, expect, it } from "vitest";
import { buildReverseBillingInvoices } from "@/lib/billing/self-billing";
import { isValidIban, payoutEndToEndId } from "@/lib/billing/sepa";

const base = {
  timesheetId: "cltimesheet0000000000000000",
  billableMinutes: 480, // 8h
  hourlyRateCents: 3000, // EUR 30
  freelancerId: "clfreelancer000000000000000",
  recipientTenantId: "cltenant00000000000000000000",
  platformTenantId: "clplatform0000000000000000000",
  shiftTitle: "Bediening",
  workedOn: new Date("2026-08-20T09:00:00Z"),
  freelancerInvoiceNumber: "ZF-SB-2026-000001",
  platformInvoiceNumber: "ZF-PF-2026-000001",
};

describe("buildReverseBillingInvoices", () => {
  it("applies 21% VAT for a domestic NL engagement", () => {
    const r = buildReverseBillingInvoices({
      ...base,
      freelancerCountry: "NL",
      recipientCountry: "NL",
      freelancerVatValid: true,
    });
    expect(r.freelancerInvoice.subtotalCents).toBe(24000);
    expect(r.freelancerInvoice.vatCents).toBe(5040);
    expect(r.freelancerInvoice.totalCents).toBe(29040);
    expect(r.freelancerPayoutCents).toBe(29040);
    expect(r.freelancerInvoice.vatTreatment).toBe("STANDARD_RATE");
  });

  it("shifts to reverse charge for a cross-border EU B2B engagement", () => {
    const r = buildReverseBillingInvoices({
      ...base,
      freelancerCountry: "BE",
      recipientCountry: "NL",
      freelancerVatValid: true,
    });
    expect(r.freelancerInvoice.vatCents).toBe(0);
    expect(r.freelancerInvoice.vatTreatment).toBe("REVERSE_CHARGE");
    expect(r.freelancerInvoice.totalCents).toBe(24000);
  });

  it("bills a separate platform-fee invoice at a flat rate per hour", () => {
    const r = buildReverseBillingInvoices({
      ...base,
      freelancerCountry: "NL",
      recipientCountry: "NL",
      freelancerVatValid: true,
    });
    // EUR 3,50/uur * 8h = 2800, + 21% VAT (588). Independent of the hourly rate.
    expect(r.platformFeeInvoice.subtotalCents).toBe(2800);
    expect(r.platformFeeInvoice.vatCents).toBe(588);
    expect(r.platformFeeInvoice.type).toBe("PLATFORM_FEE");
    // the worker's payout is untouched by the fee
    expect(r.freelancerPayoutCents).toBe(29040);
  });
});

describe("isValidIban", () => {
  it("accepts a well-formed NL IBAN", () => {
    expect(isValidIban("NL91ABNA0417164300")).toBe(true);
    expect(isValidIban("nl91 abna 0417 1643 00")).toBe(true);
  });
  it("rejects a bad checksum or malformed value", () => {
    expect(isValidIban("NL92ABNA0417164300")).toBe(false);
    expect(isValidIban("NOTANIBAN")).toBe(false);
  });
});

describe("payoutEndToEndId", () => {
  it("is deterministic and <= 35 chars", () => {
    const id = payoutEndToEndId("clinvoice000000000000000000");
    expect(id).toBe(payoutEndToEndId("clinvoice000000000000000000"));
    expect(id.length).toBeLessThanOrEqual(35);
  });
});
