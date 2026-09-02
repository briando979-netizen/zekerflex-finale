import { prisma } from "@/lib/prisma";
import type { Principal } from "@/lib/auth";
import { hasRole } from "@/lib/auth";

export interface EmployerScope {
  tenantIds: string[];
  branchIds: string[] | null; // null => all branches of the tenants
}

/** Which organizations / locations this principal manages. */
export async function resolveEmployerScope(p: Principal): Promise<EmployerScope> {
  if (hasRole(p, "PLATFORM_ADMIN")) {
    const tenants = await prisma.tenant.findMany({
      where: { type: { in: ["ENTERPRISE_HQ", "FRANCHISE"] } },
      select: { id: true },
    });
    return { tenantIds: tenants.map((t) => t.id), branchIds: null };
  }

  const tenantIds = [
    ...new Set(
      p.grants
        .filter((g) => ["HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER"].includes(g.role))
        .map((g) => g.organizationId),
    ),
  ];

  // A LOCAL_MANAGER scoped to specific branches only sees those.
  const onlyLocalScoped =
    p.grants.length > 0 &&
    p.grants.every((g) => g.role === "LOCAL_MANAGER" && g.locationIds.length > 0);
  const branchIds = onlyLocalScoped ? p.managedBranchIds : null;

  return { tenantIds, branchIds };
}

export interface EmployerOverview {
  orgName: string;
  kpis: {
    openShifts: number;
    toApprove: number;
    spentThisMonthCents: number;
    activeFreelancers: number;
  };
  shifts: {
    id: string;
    title: string;
    branch: string;
    startsAt: Date;
    endsAt: Date;
    positions: number;
    filled: number;
    status: string;
  }[];
  approvals: {
    id: string;
    freelancer: string;
    branch: string;
    scheduledStart: Date;
    billableMinutes: number;
    hourlyRateCents: number;
  }[];
  invoices: {
    id: string;
    number: string;
    type: string;
    totalCents: number;
    status: string;
    createdAt: Date;
  }[];
}

export async function getEmployerOverview(p: Principal): Promise<EmployerOverview> {
  const scope = await resolveEmployerScope(p);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const branchFilter = scope.branchIds
    ? { id: { in: scope.branchIds } }
    : { tenantId: { in: scope.tenantIds } };

  const orgTenant = await prisma.tenant.findFirst({
    where: { id: { in: scope.tenantIds } },
    select: { name: true },
  });

  const [openShifts, toApprove, upcoming, approvals, invoices, activeAssignments] = await Promise.all([
    prisma.shift.count({
      where: { branch: branchFilter, status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] } },
    }),
    prisma.timesheet.count({
      where: { branch: branchFilter, status: "SUBMITTED" },
    }),
    prisma.shift.findMany({
      where: { branch: branchFilter, status: { notIn: ["CANCELLED", "COMPLETED"] } },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        positions: true,
        status: true,
        branch: { select: { name: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 8,
    }),
    prisma.timesheet.findMany({
      where: { branch: branchFilter, status: "SUBMITTED" },
      select: {
        id: true,
        scheduledStart: true,
        billableMinutes: true,
        hourlyRateCents: true,
        branch: { select: { name: true } },
        freelancer: { select: { user: { select: { fullName: true } } } },
      },
      orderBy: { submittedAt: "asc" },
      take: 8,
    }),
    prisma.invoice.findMany({
      where: { recipientTenantId: { in: scope.tenantIds } },
      select: {
        id: true,
        number: true,
        type: true,
        totalCents: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.shiftAssignment.findMany({
      where: {
        cancelledAt: null,
        shift: { branch: branchFilter, startsAt: { gte: monthStart } },
      },
      select: { freelancerId: true },
    }),
  ]);

  const spentThisMonthCents = invoices
    .filter((i) => i.status === "PAID" && i.createdAt >= monthStart)
    .reduce((s, i) => s + i.totalCents, 0);

  return {
    orgName: orgTenant?.name ?? "Je organisatie",
    kpis: {
      openShifts,
      toApprove,
      spentThisMonthCents,
      activeFreelancers: new Set(activeAssignments.map((a) => a.freelancerId)).size,
    },
    shifts: upcoming.map((s) => ({
      id: s.id,
      title: s.title,
      branch: s.branch.name,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      positions: s.positions,
      filled: s._count.assignments,
      status: s.status,
    })),
    approvals: approvals.map((t) => ({
      id: t.id,
      freelancer: t.freelancer.user.fullName,
      branch: t.branch.name,
      scheduledStart: t.scheduledStart,
      billableMinutes: t.billableMinutes,
      hourlyRateCents: t.hourlyRateCents,
    })),
    invoices,
  };
}
