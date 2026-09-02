import { describe, expect, it } from "vitest";
import { classify, computeMetrics } from "@/lib/dba-compliance";
import type { DbaMetrics, DbaThresholds } from "@/types/compliance";

const THRESHOLDS: DbaThresholds = {
  maxHoursPerClient: 1200,
  warnHoursPerClient: 900,
  maxConsecutiveWeeks: 26,
  maxClientRevenueShare: 0.7,
};

function metrics(over: Partial<DbaMetrics>): DbaMetrics {
  return {
    totalMinutes: 0,
    totalHours: 0,
    engagementCount: 0,
    distinctWeeks: 0,
    maxConsecutiveWeeks: 0,
    averageHoursPerActiveWeek: 0,
    clientRevenueShare: 0,
    distinctBranchCount: 1,
    ...over,
  };
}

const TENANT = "cltenantA0000000000000000000";
const BRANCH = "clbranchA0000000000000000000";
const OTHER_TENANT = "cltenantB0000000000000000000";

function weeksOfWork(count: number, minutesPerWeek: number, grossPerWeek: number) {
  const entries = [];
  const start = new Date("2026-01-06T09:00:00Z"); // a Monday
  for (let i = 0; i < count; i++) {
    entries.push({
      branchId: BRANCH,
      tenantId: TENANT,
      billableMinutes: minutesPerWeek,
      workedAt: new Date(start.getTime() + i * 7 * 24 * 3600 * 1000),
      grossCents: grossPerWeek,
    });
  }
  return entries;
}

describe("computeMetrics", () => {
  it("aggregates only the target tenant's work", () => {
    const entries = [
      ...weeksOfWork(4, 300, 15000),
      {
        branchId: "clbranchX",
        tenantId: OTHER_TENANT,
        billableMinutes: 600,
        workedAt: new Date("2026-02-02T09:00:00Z"),
        grossCents: 30000,
      },
    ];
    const m = computeMetrics(entries, { branchId: BRANCH, tenantId: TENANT });
    expect(m.engagementCount).toBe(4);
    expect(m.totalMinutes).toBe(1200);
    expect(m.distinctWeeks).toBe(4);
    // client gross 60000 of total 90000
    expect(m.clientRevenueShare).toBeCloseTo(0.6667, 3);
    expect(m.distinctBranchCount).toBe(2);
  });

  it("counts consecutive weeks correctly", () => {
    const m = computeMetrics(weeksOfWork(30, 2400, 120000), {
      branchId: BRANCH,
      tenantId: TENANT,
    });
    expect(m.maxConsecutiveWeeks).toBe(30);
    expect(m.averageHoursPerActiveWeek).toBeCloseTo(40, 1);
  });
});

describe("classify", () => {
  it("never throttles on thin history (e.g. a first shift at 100% revenue share)", () => {
    const r = classify(
      metrics({
        totalHours: 4.9,
        totalMinutes: 292,
        engagementCount: 1,
        distinctWeeks: 1,
        clientRevenueShare: 1,
      }),
      THRESHOLDS,
    );
    expect(r.riskLevel).toBe("LOW");
    expect(r.action).toBe("NONE");
    expect(r.rationale).toMatch(/Insufficient history/);
  });

  it("throttles a sustained, revenue-concentrated engagement", () => {
    const r = classify(
      metrics({
        totalHours: 520,
        engagementCount: 60,
        distinctWeeks: 30,
        maxConsecutiveWeeks: 10,
        clientRevenueShare: 0.8,
        averageHoursPerActiveWeek: 17,
      }),
      THRESHOLDS,
    );
    expect(r.action).toBe("THROTTLE");
    expect(r.riskLevel).toBe("HIGH");
  });

  it("blocks when two independent signals breach", () => {
    const r = classify(
      metrics({
        totalHours: 950,
        engagementCount: 120,
        distinctWeeks: 40,
        maxConsecutiveWeeks: 28,
        clientRevenueShare: 0.85,
        averageHoursPerActiveWeek: 24,
      }),
      THRESHOLDS,
    );
    expect(r.action).toBe("BLOCK");
    expect(r.riskLevel).toBe("CRITICAL");
  });
});
