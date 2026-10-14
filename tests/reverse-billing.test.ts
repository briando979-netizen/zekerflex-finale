import { describe, expect, it } from "vitest";
import { buildReverseBillingInvoices, buildUitzendInvoice } from "@/lib/billing/self-billing";
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

  it("adds a VAT-inclusive extra-costs line without double-charging VAT", () => {
    const r = buildReverseBillingInvoices({
      ...base,
      freelancerCountry: "NL",
      recipientCountry: "NL",
      freelancerVatValid: true,
      extraCostsGrossCents: 12_100, // EUR 121,00 incl. 21% VAT -> EUR 100 net
      extraCostsNote: "Parkeerkosten",
    });
    expect(r.freelancerInvoice.lines).toHaveLength(2);
    expect(r.freelancerInvoice.lines[1]!.unitPriceCents).toBe(10_000);
    expect(r.freelancerInvoice.lines[1]!.description).toContain("Parkeerkosten");
    expect(r.freelancerInvoice.subtotalCents).toBe(34_000);
    expect(r.freelancerInvoice.vatCents).toBe(7_140);
    // 29040 (shift incl. VAT) + 12100 (extra costs incl. VAT) exactly
    expect(r.freelancerInvoice.totalCents).toBe(41_140);
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

describe("buildUitzendInvoice", () => {
  const uitzendBase = {
    timesheetId: "cltimesheet0000000000000000",
    billableMinutes: 480, // 8h
    hourlyRateCents: 3000, // EUR 30 gross wage
    recipientTenantId: "cltenant00000000000000000000",
    platformTenantId: "clplatform0000000000000000000",
    shiftTitle: "Magazijn",
    workedOn: new Date("2026-08-20T09:00:00Z"),
    invoiceNumber: "ZF-UZ-2026-000001",
  };

  it("bills gross wage plus the uitzendopslag, with 21% VAT domestically", () => {
    const inv = buildUitzendInvoice({ ...uitzendBase, recipientCountry: "NL" });
    // wage: 8h * EUR 30 = 24000. markup: 35% of 24000 = 8400. subtotal 32400.
    expect(inv.lines).toHaveLength(2);
    expect(inv.lines[0]!.amountCents).toBe(24_000);
    expect(inv.lines[1]!.amountCents).toBe(8_400);
    expect(inv.subtotalCents).toBe(32_400);
    expect(inv.vatTreatment).toBe("STANDARD_RATE");
    expect(inv.vatCents).toBe(6_804); // 21% of 32400
    expect(inv.totalCents).toBe(39_204);
    expect(inv.type).toBe("UITZEND_FEE");
  });

  it("falls back to out-of-scope VAT for a cross-border client rather than guessing reverse charge", () => {
    const inv = buildUitzendInvoice({ ...uitzendBase, recipientCountry: "DE" });
    expect(inv.vatTreatment).toBe("OUT_OF_SCOPE");
    expect(inv.vatCents).toBe(0);
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
