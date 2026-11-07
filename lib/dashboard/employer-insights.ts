import { prisma } from "@/lib/prisma";

export async function getEmployerInsights(branchId: string) {
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // Shifts this month
  const shiftsThisMonth = await prisma.shift.count({
    where: { branchId, createdAt: { gte: thisMonth } },
  });

  // Filled positions this month
  const filledThisMonth = await prisma.shiftAssignment.count({
    where: {
      shift: { branchId },
      acceptedAt: { gte: thisMonth },
    },
  });

  // No-show rate (this month)
  const submittedThisMonth = await prisma.timesheet.count({
    where: {
      branch: { id: branchId },
      submittedAt: { gte: thisMonth },
    },
  });

  const acceptedThisMonth = await prisma.shiftAssignment.count({
    where: {
      shift: { branchId },
      acceptedAt: { gte: thisMonth },
    },
  });

  const noShowRate = acceptedThisMonth > 0 ? ((acceptedThisMonth - submittedThisMonth) / acceptedThisMonth) * 100 : 0;

  // Top workers (this month)
  const topWorkers = await prisma.shiftAssignment.groupBy({
    by: ["freelancerId"],
    where: {
      shift: { branchId },
      acceptedAt: { gte: thisMonth },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 5,
  });

  // Average hiring time (days to fill)
  const recentShifts = await prisma.shift.findMany({
    where: { branchId, createdAt: { gte: lastMonth } },
    include: {
      assignments: { select: { acceptedAt: true } },
    },
    take: 20,
  });

  const fillingTimes = recentShifts
    .filter((s) => s.assignments.length > 0)
    .map((s) => {
      const firstAssignment = s.assignments[0];
      if (!firstAssignment) return 0;
      return (new Date(firstAssignment.acceptedAt).getTime() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    });

  const avgFillingTime = fillingTimes.length > 0 ? fillingTimes.reduce((a, b) => a + b) / fillingTimes.length : 0;

  // Cost summary
  const totalHours = await prisma.timesheet.aggregate({
    where: {
      branch: { id: branchId },
      status: { in: ["APPROVED", "PAID"] },
      approvedAt: { gte: thisMonth },
    },
    _sum: { billableMinutes: true },
  });

  const totalSpent = await prisma.invoice.aggregate({
    where: {
      recipientTenant: { branches: { some: { id: branchId } } },
      status: { in: ["ISSUED", "PAID"] },
      issuedAt: { gte: thisMonth },
    },
    _sum: { totalCents: true },
  });

  return {
    shifts: {
      created: shiftsThisMonth,
      filled: filledThisMonth,
      fillRate: shiftsThisMonth > 0 ? (filledThisMonth / shiftsThisMonth) * 100 : 0,
    },
    quality: {
      noShowRate: parseFloat(noShowRate.toFixed(1)),
      avgFillingTime: parseFloat(avgFillingTime.toFixed(1)),
    },
    costs: {
      totalHours: Math.round((totalHours._sum.billableMinutes || 0) / 60),
      totalSpent: (totalSpent._sum.totalCents || 0) / 100,
    },
    topWorkers: topWorkers.map((w) => ({ freelancerId: w.freelancerId, shifts: w._count.id })),
  };
}
