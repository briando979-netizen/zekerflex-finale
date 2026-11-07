import { prisma } from "@/lib/prisma";

/**
 * Worker dashboard summary: earnings, hours, upcoming shifts
 * Gisteren, deze maand, totaal
 */

export async function getWorkerSummary(freelancerId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Totale earnings (all time, approved timesheets)
  const totalEarnings = await prisma.timesheet.aggregate({
    where: {
      freelancerId,
      status: { in: ["APPROVED", "PAID"] },
    },
    _sum: { billingAmount: true },
  });

  // Earnings deze maand
  const monthEarnings = await prisma.timesheet.aggregate({
    where: {
      freelancerId,
      status: { in: ["APPROVED", "PAID"] },
      approvedAt: { gte: startOfMonth },
    },
    _sum: { billingAmount: true },
  });

  // Gisteren verdient
  const yesterdayEarnings = await prisma.timesheet.aggregate({
    where: {
      freelancerId,
      status: { in: ["APPROVED", "PAID"] },
      approvedAt: {
        gte: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()),
        lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      },
    },
    _sum: { billingAmount: true },
  });

  // Totale uren (approved)
  const totalHours = await prisma.timesheet.aggregate({
    where: {
      freelancerId,
      status: { in: ["APPROVED", "PAID"] },
    },
    _sum: { billableMinutes: true },
  });

  // Uren deze maand
  const monthHours = await prisma.timesheet.aggregate({
    where: {
      freelancerId,
      status: { in: ["APPROVED", "PAID"] },
      approvedAt: { gte: startOfMonth },
    },
    _sum: { billableMinutes: true },
  });

  // Komende shifts (next 7 days, not yet completed)
  const upcomingShifts = await prisma.shiftAssignment.findMany({
    where: {
      freelancerId,
      status: "ACCEPTED",
      shift: {
        startsAt: {
          gte: now,
          lt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    },
    include: {
      shift: {
        select: {
          title: true,
          startsAt: true,
          hourlyRateCents: true,
          branch: { select: { name: true } },
        },
      },
    },
    orderBy: { shift: { startsAt: "asc" } },
    take: 5,
  });

  // Pending/rejected timesheets
  const pendingTimesheets = await prisma.timesheet.count({
    where: { freelancerId, status: "SUBMITTED" },
  });

  const rejectedTimesheets = await prisma.timesheet.findMany({
    where: { freelancerId, status: "REJECTED" },
    select: { rejectionReason: true, submittedAt: true },
    orderBy: { submittedAt: "desc" },
    take: 1,
  });

  return {
    earnings: {
      total: (totalEarnings._sum.billingAmount || 0) / 100,
      thisMonth: (monthEarnings._sum.billingAmount || 0) / 100,
      yesterday: (yesterdayEarnings._sum.billingAmount || 0) / 100,
    },
    hours: {
      total: Math.round((totalHours._sum.billableMinutes || 0) / 60),
      thisMonth: Math.round((monthHours._sum.billableMinutes || 0) / 60),
    },
    upcomingShifts,
    status: {
      pendingApproval: pendingTimesheets,
      lastRejection: rejectedTimesheets[0],
    },
  };
}
