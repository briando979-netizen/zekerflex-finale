import { prisma } from '@/lib/prisma';

export interface WorkerProfileStats {
  workerId: string;
  totalHours: number;
  totalEarnings: number;
  acceptanceRate: number;
  completionRate: number;
  averageRating: number;
}

export async function getWorkerProfileStats(workerId: string): Promise<WorkerProfileStats> {
  const assignments = await prisma.assignment.findMany({
    where: { freelancerId: workerId },
  });

  const totalHours = assignments.reduce((sum, a) => sum + (a.durationMinutes / 60), 0);
  const totalEarnings = assignments.reduce((sum, a) => sum + (a.earnedCent || 0), 0);

  const accepted = assignments.filter(a => a.status !== 'DECLINED').length;
  const acceptanceRate = assignments.length > 0 ? accepted / assignments.length : 0;

  const completed = assignments.filter(a => a.status === 'COMPLETED').length;
  const completionRate = assignments.length > 0 ? completed / assignments.length : 0;

  const ratings = assignments.filter(a => a.rating).map(a => a.rating || 0);
  const averageRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b) / ratings.length : 0;

  return {
    workerId,
    totalHours,
    totalEarnings,
    acceptanceRate,
    completionRate,
    averageRating,
  };
}

export async function updateWorkerStats(workerId: string): Promise<void> {
  const stats = await getWorkerProfileStats(workerId);

  await prisma.freelancerProfile.update({
    where: { userId: workerId },
    data: {
      totalHoursWorked: Math.round(stats.totalHours * 100) / 100,
      averageRating: Math.round(stats.averageRating * 100) / 100,
    },
  });
}
