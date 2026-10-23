import { afterEach, describe, expect, it, vi } from "vitest";

const invoiceAggregate = vi.fn();
const invoiceFindMany = vi.fn(async () => []);
const timesheetFindMany = vi.fn(async () => []);
const shiftCount = vi.fn(async () => 0);
const assignmentFindMany = vi.fn(async () => []);
const freelancerCount = vi.fn(async () => 0);
const auditFindMany = vi.fn(async () => []);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { aggregate: (...a: unknown[]) => invoiceAggregate(...a), findMany: (...a: unknown[]) => invoiceFindMany(...a) },
    timesheet: { findMany: (...a: unknown[]) => timesheetFindMany(...a) },
    shift: { count: (...a: unknown[]) => shiftCount(...a) },
    shiftAssignment: { findMany: (...a: unknown[]) => assignmentFindMany(...a) },
    freelancerProfile: { count: (...a: unknown[]) => freelancerCount(...a) },
    auditLog: { findMany: (...a: unknown[]) => auditFindMany(...a) },
  },
}));

import { dashboardStats } from "@/lib/admin/dashboard";

const NOW = new Date("2026-10-23T12:00:00Z");

afterEach(() => vi.clearAllMocks());

describe("dashboardStats", () => {
  it("computes week-over-week revenue change, fulfillment and a 30-day series", async () => {
    // week revenue 1200.00, prev week 1000.00 → +20%
    invoiceAggregate.mockResolvedValueOnce({ _sum: { totalCents: 120000 } }).mockResolvedValueOnce({ _sum: { totalCents: 100000 } });
    invoiceFindMany.mockResolvedValue([
      { totalCents: 50000, createdAt: new Date("2026-10-22T09:00:00Z") },
      { totalCents: 70000, createdAt: new Date("2026-10-20T09:00:00Z") },
    ]);
    timesheetFindMany.mockResolvedValue([
      { billableMinutes: 480, scheduledStart: new Date("2026-10-22T08:00:00Z") }, // 8h, within week
      { billableMinutes: 240, scheduledStart: new Date("2026-10-01T08:00:00Z") }, // older, in 30d but not 7d
    ]);
    shiftCount.mockResolvedValueOnce(50).mockResolvedValueOnce(48); // total, filled
    assignmentFindMany.mockResolvedValue([{ freelancerId: "f1" }, { freelancerId: "f1" }, { freelancerId: "f2" }]);
    freelancerCount.mockResolvedValue(0);
    auditFindMany.mockResolvedValue([{ action: "agreement.signed.client", summary: "x", createdAt: NOW }]);

    const s = await dashboardStats(NOW);
    expect(s.grossVolumeCents).toBe(120000);
    expect(s.grossVolumeChangePct).toBe(20);
    expect(s.workedHours).toBe(8); // only the in-week timesheet
    expect(s.activeFreelancersToday).toBe(2); // distinct f1,f2
    expect(s.fulfillmentRate).toBe(0.96);
    expect(s.shiftsFilled).toBe(48);
    expect(s.series).toHaveLength(30);
    expect(s.compliancePct).toBe(100); // 0 risk flags
    expect(s.activity[0]!.text).toMatch(/ondertekend/i);
  });

  it("degrades gracefully when queries fail (fallbacks, no throw)", async () => {
    invoiceAggregate.mockRejectedValue(new Error("db down"));
    invoiceFindMany.mockRejectedValue(new Error("db down"));
    timesheetFindMany.mockRejectedValue(new Error("db down"));
    shiftCount.mockRejectedValue(new Error("db down"));
    assignmentFindMany.mockRejectedValue(new Error("db down"));
    freelancerCount.mockRejectedValue(new Error("db down"));
    auditFindMany.mockRejectedValue(new Error("db down"));
    const s = await dashboardStats(NOW);
    expect(s.grossVolumeCents).toBe(0);
    expect(s.fulfillmentRate).toBe(0);
    expect(s.series).toHaveLength(30);
    expect(s.activity).toEqual([]);
  });
});
