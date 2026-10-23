import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Kleine, persoonlijke dashboard-helpers:
//   • todaysShifts   — de diensten die deze freelancer vandaag zelf heeft,
//     voor de "Vandaag"-strip bovenaan.
//   • completedKlussenCount — hoeveel klussen al voltooid zijn (goedgekeurde of
//     uitbetaalde uren), voor de mijlpaal-felicitatie.
// Read-only, best-effort.
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

export interface TodayShift {
  id: string;
  title: string;
  startsAt: Date;
  branchName: string;
}

export async function todaysShifts(userId: string, now = new Date()): Promise<TodayShift[]> {
  const profile = await prisma.freelancerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return [];
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + DAY);
  const rows = await prisma.shiftAssignment.findMany({
    where: { freelancerId: profile.id, cancelledAt: null, shift: { startsAt: { gte: dayStart, lt: dayEnd } } },
    orderBy: { shift: { startsAt: "asc" } },
    take: 5,
    select: { shift: { select: { id: true, title: true, startsAt: true, branch: { select: { name: true } } } } },
  });
  return rows.map((r) => ({
    id: r.shift.id,
    title: r.shift.title,
    startsAt: r.shift.startsAt,
    branchName: r.shift.branch?.name ?? "",
  }));
}

export async function completedKlussenCount(userId: string): Promise<number> {
  const profile = await prisma.freelancerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return 0;
  return prisma.timesheet.count({ where: { freelancerId: profile.id, status: { in: ["APPROVED", "PAID"] } } });
}
