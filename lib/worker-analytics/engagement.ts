import { prisma } from '@/lib/prisma';

export interface EngagementMetrics {
  workerId: string;
  activityTrend: number;
  motivationScore: number;
  lastActiveDate: Date;
  shiftsAcceptedThisWeek: number;
  appOpenCount: number;
  notificationEngagement: number;
}

export async function calculateEngagementMetrics(workerId: string): Promise<EngagementMetrics> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const thisWeekAssignments = await prisma.assignment.findMany({
    where: { freelancerId: workerId, createdAt: { gte: weekAgo } },
  });

  const lastWeekAssignments = await prisma.assignment.findMany({
    where: {
      freelancerId: workerId,
      createdAt: { gte: twoWeeksAgo, lt: weekAgo },
    },
  });

  const activityTrend = lastWeekAssignments.length > 0
    ? ((thisWeekAssignments.length - lastWeekAssignments.length) / lastWeekAssignments.length) * 100
    : (thisWeekAssignments.length > 0 ? 100 : 0);

  const acceptedThisWeek = thisWeekAssignments.filter(a => a.status !== 'DECLINED').length;
  const completedThisWeek = thisWeekAssignments.filter(a => a.status === 'COMPLETED').length;

  let motivationScore = 50;
  if (activityTrend > 20) motivationScore += 20;
  if (acceptedThisWeek >= 3) motivationScore += 15;
  if (completedThisWeek === acceptedThisWeek && acceptedThisWeek > 0) motivationScore += 15;

  motivationScore = Math.min(100, Math.max(0, motivationScore));

  const lastAssignment = await prisma.assignment.findFirst({
    where: { freelancerId: workerId },
    orderBy: { updatedAt: 'desc' },
  });

  return {
    workerId,
    activityTrend: Math.round(activityTrend * 100) / 100,
    motivationScore,
    lastActiveDate: lastAssignment?.updatedAt || new Date(),
    shiftsAcceptedThisWeek: acceptedThisWeek,
    appOpenCount: 0,
    notificationEngagement: acceptedThisWeek / Math.max(1, thisWeekAssignments.length),
  };
}
