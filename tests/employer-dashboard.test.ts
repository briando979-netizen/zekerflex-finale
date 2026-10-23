import { afterEach, describe, expect, it, vi } from "vitest";

const resolveEmployerScope = vi.fn();
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: (...a: unknown[]) => resolveEmployerScope(...a) }));

const invoiceAggregate = vi.fn();
const invoiceFindMany = vi.fn(async (..._a: unknown[]) => [] as unknown[]);
const timesheetFindMany = vi.fn(async (..._a: unknown[]) => [] as unknown[]);
const timesheetCount = vi.fn(async (..._a: unknown[]) => 0);
const shiftCount = vi.fn(async (..._a: unknown[]) => 0);
const assignmentFindMany = vi.fn(async (..._a: unknown[]) => [] as unknown[]);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { aggregate: (...a: unknown[]) => invoiceAggregate(...a), findMany: (...a: unknown[]) => invoiceFindMany(...a) },
    timesheet: { findMany: (...a: unknown[]) => timesheetFindMany(...a), count: (...a: unknown[]) => timesheetCount(...a) },
    shift: { count: (...a: unknown[]) => shiftCount(...a) },
    shiftAssignment: { findMany: (...a: unknown[]) => assignmentFindMany(...a) },
  },
}));

import { employerDashboardStats } from "@/lib/dashboard/employer-dashboard";
import type { Principal } from "@/lib/auth";

const NOW = new Date("2026-10-23T12:00:00Z");
const principal = { userId: "u1", grants: [] } as unknown as Principal;

afterEach(() => vi.clearAllMocks());

describe("employerDashboardStats", () => {
  it("scopes queries to the employer's tenants and computes KPIs", async () => {
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    invoiceAggregate.mockResolvedValueOnce({ _sum: { totalCents: 90000 } }).mockResolvedValueOnce({ _sum: { totalCents: 60000 } }); // +50%
    timesheetFindMany.mockResolvedValue([{ billableMinutes: 600, scheduledStart: new Date("2026-10-22T08:00:00Z") }]); // 10h this week
    shiftCount.mockResolvedValueOnce(20).mockResolvedValueOnce(15); // total, filled
    timesheetCount.mockResolvedValue(3); // to approve
    assignmentFindMany.mockResolvedValue([{ freelancerId: "f1" }]);

    const s = await employerDashboardStats(principal, NOW);
    // invoice query filtered by the employer's tenant
    expect(invoiceAggregate.mock.calls[0]![0].where.recipientTenantId).toEqual({ in: ["t1"] });
    expect(s.spentCents).toBe(90000);
    expect(s.spentChangePct).toBe(50);
    expect(s.workedHours).toBe(10);
    expect(s.fillRate).toBe(0.75);
    expect(s.hoursToApprove).toBe(3);
    expect(s.series).toHaveLength(30);
  });

  it("falls back cleanly when scope resolution or queries fail", async () => {
    resolveEmployerScope.mockResolvedValue({ tenantIds: [], branchIds: null });
    invoiceAggregate.mockResolvedValue({ _sum: { totalCents: null } });
    const s = await employerDashboardStats(principal, NOW);
    expect(s.spentCents).toBe(0);
    expect(s.fillRate).toBe(0);
    expect(s.activity).toEqual([]);
  });
});
