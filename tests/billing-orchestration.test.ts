/**
 * Tests for Payment & Billing Orchestration (6 subsystems)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { calculateInvoiceTotals, generateInvoiceNumber } from "@/lib/billing/invoices";
import { calculateProration, calculateNextBillingDate } from "@/lib/billing/billing-cycles";
import { calculateTaxDeductibility } from "@/lib/billing/expense-tracking";
import { calculateMonthlyRecognition } from "@/lib/billing/revenue-recognition";

describe("Billing Orchestration - Invoices", () => {
  it("calculates invoice totals with VAT", () => {
    const lines = [
      { description: "Service 1", quantity: 10, unitPriceCents: 5000 }, // €500
      { description: "Service 2", quantity: 5, unitPriceCents: 2000 }, // €100
    ];

    const result = calculateInvoiceTotals(lines, 0.21);

    expect(result.subtotalCents).toBe(60000); // €600
    expect(result.vatCents).toBe(12600); // 21% of €600
    expect(result.totalCents).toBe(72600); // €726
  });

  it("handles zero-rate VAT", () => {
    const lines = [
      { description: "Exempted service", quantity: 1, unitPriceCents: 10000 },
    ];

    const result = calculateInvoiceTotals(lines, 0);

    expect(result.subtotalCents).toBe(10000);
    expect(result.vatCents).toBe(0);
    expect(result.totalCents).toBe(10000);
  });

  it("handles single line item", () => {
    const lines = [
      { description: "Product", quantity: 2.5, unitPriceCents: 4000 },
    ];

    const result = calculateInvoiceTotals(lines, 0.06);

    expect(result.subtotalCents).toBe(10000); // 2.5 * 4000
    expect(result.vatCents).toBe(600); // 6% of 10000
  });
});

describe("Billing Orchestration - Billing Cycles", () => {
  it("calculates prorated amount for partial month", () => {
    const baseCents = 30000; // €300
    const cycleStart = new Date("2026-11-01");
    const cycleEnd = new Date("2026-11-30");
    const usageStart = new Date("2026-11-10"); // 10th to 30th = 21 days
    const usageEnd = new Date("2026-11-30");

    const result = calculateProration(
      baseCents,
      usageStart,
      usageEnd,
      cycleStart,
      cycleEnd,
    );

    expect(result.daysInCycle).toBe(30); // November has 30 days
    expect(result.daysUsed).toBeGreaterThan(0);
    expect(result.proratedCents).toBeLessThan(baseCents);
    expect(result.proratedCents).toBeGreaterThan(0);
  });

  it("calculates next billing date for monthly frequency", () => {
    const config = {
      tenantId: "t1",
      frequency: "MONTHLY" as const,
      dayOfMonth: 15,
      startDate: new Date("2026-10-15"),
    };

    const currentDate = new Date("2026-10-15");
    const nextDate = calculateNextBillingDate(config, currentDate);

    expect(nextDate.getDate()).toBe(15);
    expect(nextDate.getMonth()).toBe(10); // November (0-indexed)
  });

  it("calculates next billing date for annual frequency", () => {
    const config = {
      tenantId: "t1",
      frequency: "ANNUAL" as const,
      dayOfMonth: 1,
      startDate: new Date("2026-01-01"),
    };

    const currentDate = new Date("2026-01-01");
    const nextDate = calculateNextBillingDate(config, currentDate);

    expect(nextDate.getFullYear()).toBe(2027);
    expect(nextDate.getMonth()).toBe(0); // January
    expect(nextDate.getDate()).toBe(1);
  });

  it("calculates next billing date for custom interval", () => {
    const config = {
      tenantId: "t1",
      frequency: "CUSTOM" as const,
      customIntervalDays: 14,
      startDate: new Date("2026-11-01"),
    };

    const currentDate = new Date("2026-11-01");
    const nextDate = calculateNextBillingDate(config, currentDate);

    expect(nextDate.getDate()).toBe(15); // 14 days later
  });

  it("throws error for invalid custom interval without customIntervalDays", () => {
    const config = {
      tenantId: "t1",
      frequency: "CUSTOM" as const,
      startDate: new Date("2026-11-01"),
    };

    expect(() => calculateNextBillingDate(config as any)).toThrow();
  });
});

describe("Billing Orchestration - Expense Tracking", () => {
  it("calculates tax deductibility for business expenses", () => {
    const amount = 10000; // €100

    const stripeFee = calculateTaxDeductibility("STRIPE_FEES", amount);
    expect(stripeFee.deductible).toBe(10000); // 100% deductible
    expect(stripeFee.nonDeductible).toBe(0);
  });

  it("applies 50% deductibility for meals", () => {
    const amount = 10000; // €100

    const meals = calculateTaxDeductibility("MEALS", amount);
    expect(meals.deductible).toBe(5000); // 50% deductible
    expect(meals.nonDeductible).toBe(5000);
  });

  it("applies 80% deductibility for travel", () => {
    const amount = 10000; // €100

    const travel = calculateTaxDeductibility("TRAVEL", amount);
    expect(travel.deductible).toBe(8000); // 80% deductible
    expect(travel.nonDeductible).toBe(2000);
  });

  it("applies 60% deductibility for utilities", () => {
    const amount = 10000; // €100

    const utilities = calculateTaxDeductibility("UTILITIES", amount);
    expect(utilities.deductible).toBe(6000); // 60% deductible
    expect(utilities.nonDeductible).toBe(4000);
  });

  it("sums deductible and non-deductible correctly", () => {
    const amount = 12345;

    const result = calculateTaxDeductibility("SUPPLIES", amount);
    expect(result.deductible + result.nonDeductible).toBe(amount);
  });
});

describe("Billing Orchestration - Revenue Recognition", () => {
  it("calculates monthly recognition for 12-month contract", () => {
    const totalCents = 120000; // €1200
    const months = 12;

    const monthly = calculateMonthlyRecognition(totalCents, months);

    expect(monthly).toBe(10000); // €100 per month
  });

  it("calculates monthly recognition for quarterly contract", () => {
    const totalCents = 30000; // €300
    const months = 3;

    const monthly = calculateMonthlyRecognition(totalCents, months);

    expect(monthly).toBe(10000); // €100 per month
  });

  it("handles rounding for uneven division", () => {
    const totalCents = 10000; // €100
    const months = 3;

    const monthly = calculateMonthlyRecognition(totalCents, months);

    expect(monthly).toBe(3333); // Rounded €33.33
  });

  it("throws error for invalid contract months", () => {
    expect(() => calculateMonthlyRecognition(10000, 0)).toThrow();
    expect(() => calculateMonthlyRecognition(10000, -1)).toThrow();
  });
});

describe("Billing Orchestration - Integration Scenarios", () => {
  it("handles complete invoice-to-payment workflow", () => {
    // Step 1: Create invoice with lines
    const lines = [
      { description: "Service", quantity: 8, unitPriceCents: 5000 },
    ];
    const totals = calculateInvoiceTotals(lines, 0.21);

    expect(totals.subtotalCents).toBe(40000); // 8 * 5000
    expect(totals.totalCents).toBe(48400); // with 21% VAT

    // Step 2: Calculate next billing date
    const nextBilling = calculateNextBillingDate({
      tenantId: "employer1",
      frequency: "MONTHLY",
      dayOfMonth: 1,
      startDate: new Date(),
    });

    expect(nextBilling).toBeInstanceOf(Date);
    expect(nextBilling > new Date()).toBe(true);
  });

  it("handles subscription with prorated amount on cancellation", () => {
    // Full month cost: €300
    const baseCents = 30000;
    const cycleStart = new Date("2026-11-01");
    const cycleEnd = new Date("2026-11-30");

    // Used 10 days of 30
    const usageEnd = new Date("2026-11-10");

    const proration = calculateProration(
      baseCents,
      cycleStart,
      usageEnd,
      cycleStart,
      cycleEnd,
    );

    expect(proration.proratedCents).toBeGreaterThan(0);
    expect(proration.proratedCents).toBeLessThan(baseCents);

    // Refund should be: remaining 20 days
    const refundCents = baseCents - proration.proratedCents;
    expect(refundCents).toBeGreaterThan(0);
  });

  it("applies tax deductibility across mixed expenses", () => {
    const expenses = [
      { category: "STRIPE_FEES" as const, amount: 50000 }, // €500
      { category: "TRAVEL" as const, amount: 30000 }, // €300
      { category: "MEALS" as const, amount: 10000 }, // €100
    ];

    let totalDeductible = 0;
    for (const exp of expenses) {
      const calc = calculateTaxDeductibility(exp.category, exp.amount);
      totalDeductible += calc.deductible;
    }

    // 500 (100%) + 240 (80%) + 50 (50%) = 790
    expect(totalDeductible).toBe(79000);
  });

  it("creates revenue schedule for subscription", () => {
    const contractCents = 120000; // €1200 annual
    const months = 12;

    const monthlyAmount = calculateMonthlyRecognition(contractCents, months);

    // Track recognition
    let totalRecognized = 0;
    for (let m = 0; m < 12; m++) {
      totalRecognized += monthlyAmount;
    }

    // Due to rounding, should be close to original
    expect(Math.abs(totalRecognized - contractCents)).toBeLessThanOrEqual(11);
  });
});

describe("Billing Orchestration - Edge Cases", () => {
  it("handles zero-amount lines in invoice totals", () => {
    const lines = [
      { description: "Free item", quantity: 0, unitPriceCents: 5000 },
      { description: "Paid item", quantity: 2, unitPriceCents: 5000 },
    ];

    const result = calculateInvoiceTotals(lines, 0.21);

    expect(result.subtotalCents).toBe(10000);
    expect(result.totalCents).toBeGreaterThan(0);
  });

  it("handles large monetary values without precision loss", () => {
    const largeLine = [
      { description: "Large contract", quantity: 100, unitPriceCents: 100000 }, // €100,000
    ];

    const result = calculateInvoiceTotals(largeLine, 0.21);

    expect(result.subtotalCents).toBe(10000000); // €100,000
    expect(result.vatCents).toBe(2100000); // €21,000
    expect(result.totalCents).toBe(12100000); // €121,000
  });

  it("handles fractional quantities and rounding", () => {
    const fractionalLines = [
      { description: "Service", quantity: 1.5, unitPriceCents: 3333 }, // Should round to €50
    ];

    const result = calculateInvoiceTotals(fractionalLines, 0);

    expect(result.subtotalCents).toBeGreaterThan(0);
    expect(result.totalCents).toBe(result.subtotalCents); // No VAT
  });

  it("prorates correctly across month boundaries", () => {
    const baseCents = 100000; // €1000
    const cycleStart = new Date("2026-10-01");
    const cycleEnd = new Date("2026-10-31"); // 31 days
    const usageStart = new Date("2026-10-20"); // 20-31 = 12 days
    const usageEnd = new Date("2026-10-31");

    const result = calculateProration(
      baseCents,
      usageStart,
      usageEnd,
      cycleStart,
      cycleEnd,
    );

    expect(result.daysInCycle).toBe(31);
    expect(result.daysUsed).toBeGreaterThan(0);
    expect(result.proratedCents).toBeLessThan(baseCents);
  });
});
