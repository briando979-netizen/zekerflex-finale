import { hasRole, type Principal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";

export interface AgendaShift {
  id: string;
  title: string;
  branch: string;
  start: string;
  end: string;
  positions: number;
  filled: number;
}

/** The employer's own ZekerFlex shifts in a window, shown next to their appointments. */
export async function employerShiftsBetween(p: Principal, from: Date, to: Date): Promise<AgendaShift[]> {
  if (!hasRole(p, "HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER")) return [];
  const scope = await resolveEmployerScope(p);
  if (scope.tenantIds.length === 0) return [];
  const rows = await prisma.shift.findMany({
    where: {
      branch: scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } },
      status: { not: "CANCELLED" },
      startsAt: { gte: from, lt: to },
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      positions: true,
      branch: { select: { name: true } },
      _count: { select: { assignments: { where: { cancelledAt: null } } } },
    },
    orderBy: { startsAt: "asc" },
    take: 300,
  });
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    branch: s.branch.name,
    start: s.startsAt.toISOString(),
    end: s.endsAt.toISOString(),
    positions: s.positions,
    filled: s._count.assignments,
  }));
}
