import { describe, expect, it } from "vitest";
import { monthlyPlatformFeeCents, tierFor } from "@/lib/pricing/tiers";
import { compareFlexCost } from "@/lib/rekentools/kosten";
import { nettoFromRate, requiredRate, workHours, type ZzpBase } from "@/lib/rekentools/uurtarief";
import { centsFrom, parseNl } from "@/lib/rekentools/invoer";

describe("staffel per maand", () => {
  it.each([
    [0, 0],
    [100, 35_000],
    [500, 175_000],
    [600, 207_500], // 500 × € 3,50 + 100 × € 3,25
    [2_500, 812_500], // + 1.500 × € 3,25 + 500 × € 3,00
  ])("%i uur → %i cent", (hours, cents) => {
    expect(monthlyPlatformFeeCents(hours)).toBe(cents);
  });

  it("matches the tier names the server bills", () => {
    expect(tierFor(499).tier.name).toBe("Basis");
    expect(tierFor(500).tier.name).toBe("Groei");
  });
});

describe("kosten flexkracht", () => {
  const base = { workers: 1, hoursPerWeek: 24, weeks: 12, wageCents: 1_600, factor: 1.9, rateCents: 2_500 };

  it("compares bureau × factor with tarief + € 3,50", () => {
    const r = compareFlexCost(base);
    expect(r.totalHours).toBe(288);
    expect(r.bureau.perHourCents).toBe(3_040);
    expect(r.zekerflex.perHourCents).toBe(2_850);
    expect(r.zekerflex.feePerHourCents).toBe(350);
    expect(r.bureau.totalCents).toBe(875_520);
    expect(r.zekerflex.totalCents).toBe(820_800);
    expect(r.savingCents).toBe(54_720);
    expect(r.savingPerHourCents).toBe(190);
  });

  it("reports a negative saving honestly when the bureau is cheaper", () => {
    const r = compareFlexCost({ ...base, factor: 1.5, rateCents: 3_000 });
    expect(r.savingCents).toBeLessThan(0);
  });

  it("applies the staffel on the hours of all workers together", () => {
    const r = compareFlexCost({ ...base, workers: 10, hoursPerWeek: 40, weeks: 52 });
    expect(r.zekerflex.feePerHourCents).toBeGreaterThan(325);
    expect(r.zekerflex.feePerHourCents).toBeLessThan(350);
  });

  it("does not divide by zero without hours", () => {
    const r = compareFlexCost({ ...base, hoursPerWeek: 0 });
    expect(r.totalHours).toBe(0);
    expect(r.zekerflex.feePerHourCents).toBe(350);
    expect(r.savingCents).toBe(0);
  });
});

describe("zzp-uurtarief", () => {
  const base: ZzpBase = {
    hoursPerWeek: 40,
    billablePct: 75,
    vacationWeeks: 5,
    offDays: 10,
    costsPerMonthCents: 30_000,
    pensionPerMonthCents: 25_000,
    aovPerMonthCents: 25_000,
    taxPct: 30,
  };

  it("counts worked and billable hours", () => {
    expect(workHours(base)).toEqual({ workedHours: 1_800, billableHours: 1_350 });
  });

  it("finds the rate for € 3.000 netto a month", () => {
    const r = requiredRate({ ...base, nettoPerMonthCents: 300_000 });
    expect(r.rateCents).toBe(4_521);
    expect(r.dayRateCents).toBe(36_168);
    expect(r.meetsUrencriterium).toBe(true);
    expect(r.nettoPerMonthCents).toBe(300_000);
    expect(r.revenueCents).toBe(r.taxCents + r.nettoCents + r.costsCents + r.pensionAovCents);
  });

  it("round-trips: that rate keeps at least the asked netto", () => {
    const need = requiredRate({ ...base, nettoPerMonthCents: 300_000 });
    const keep = nettoFromRate({ ...base, rateCents: need.rateCents });
    expect(keep.nettoCents).toBeGreaterThanOrEqual(3_600_000);
    expect(keep.nettoCents - 3_600_000).toBeLessThan(need.billableHours);
  });

  it("flags the urencriterium on part-time hours", () => {
    expect(requiredRate({ ...base, hoursPerWeek: 20, nettoPerMonthCents: 150_000 }).meetsUrencriterium).toBe(false);
  });

  it("shows a loss instead of hiding it when costs exceed revenue", () => {
    const r = nettoFromRate({ ...base, rateCents: 500 });
    expect(r.taxCents).toBe(0);
    expect(r.nettoCents).toBeLessThan(0);
  });

  it("returns 0 instead of Infinity without billable hours", () => {
    expect(requiredRate({ ...base, billablePct: 0, nettoPerMonthCents: 300_000 }).rateCents).toBe(0);
  });
});

describe("Nederlandse invoer", () => {
  it.each([
    ["15,50", 15.5],
    ["1.200", 1_200],
    ["€ 3.000,-", 3_000],
    ["3.000,50", 3_000.5],
    ["1,9", 1.9],
    ["2.5", 2.5],
    [" 40 ", 40],
  ])("%s → %d", (raw, n) => {
    expect(parseNl(raw)).toBe(n);
  });

  it("treats empty or text as no number", () => {
    expect(parseNl("")).toBeNaN();
    expect(parseNl("abc")).toBeNaN();
    expect(centsFrom("abc")).toBe(0);
    expect(centsFrom("15,50")).toBe(1_550);
  });
});
