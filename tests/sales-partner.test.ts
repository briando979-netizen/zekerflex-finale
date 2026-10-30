import { describe, expect, it } from "vitest";
import {
  SALES_PARTNER,
  PLATFORM_FEE_PER_HOUR_EUR,
  sharePerHourEur,
  monthlyFromClientEur,
  HOW_IT_WORKS,
  SALES_PARTNER_FAQ,
} from "@/lib/sales-partner";

describe("Sales-partner commissie-model", () => {
  it("platformfee is €3,50/uur", () => {
    expect(PLATFORM_FEE_PER_HOUR_EUR).toBe(3.5);
  });

  it("revenue share per uur = percentage van de fee (20% -> €0,70)", () => {
    expect(sharePerHourEur()).toBeCloseTo(0.7, 2);
    expect(sharePerHourEur(SALES_PARTNER.tierRevenueSharePct)).toBeCloseTo(0.88, 2); // 25% van €3,50 = €0,875 -> afgerond op centen €0,88
  });

  it("maandverdienste schaalt met gewerkte uren (320u * €0,70 = €224)", () => {
    expect(monthlyFromClientEur(320)).toBe(224);
    expect(monthlyFromClientEur(0)).toBe(0);
  });

  it("model-parameters zijn plausibel en zelf-dragend", () => {
    expect(SALES_PARTNER.activationBonusEur).toBeGreaterThan(0);
    expect(SALES_PARTNER.revenueSharePct).toBeGreaterThan(0);
    expect(SALES_PARTNER.revenueSharePct).toBeLessThan(100); // ZekerFlex houdt het grootste deel -> houdbaar
    expect(SALES_PARTNER.revenueShareMonths).toBeGreaterThan(0);
    expect(SALES_PARTNER.tierRevenueSharePct).toBeGreaterThan(SALES_PARTNER.revenueSharePct);
  });

  it("content aanwezig voor de pagina", () => {
    expect(HOW_IT_WORKS).toHaveLength(3);
    expect(SALES_PARTNER_FAQ.length).toBeGreaterThanOrEqual(4);
  });
});
