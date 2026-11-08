import { prisma } from '@/lib/prisma';

export interface EarningsAnalysis {
  workerId: string;
  currentHourlyRate: number;
  averageMonthlyEarnings: number;
  rateHistory: { month: string; rate: number }[];
  seasonalTrend: string;
  projectedAnnual: number;
}

export async function analyzeEarnings(workerId: string): Promise<EarningsAnalysis> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const assignments = await prisma.assignment.findMany({
    where: {
      freelancerId: workerId,
      status: 'COMPLETED',
      completedAt: { gte: sixMonthsAgo },
    },
  });

  const totalEarnings = assignments.reduce((sum, a) => sum + (a.earnedCent || 0), 0);
  const totalHours = assignments.reduce((sum, a) => sum + (a.durationMinutes / 60), 0);

  const currentHourlyRate = totalHours > 0 ? (totalEarnings / 100) / totalHours : 0;
  const averageMonthlyEarnings = totalEarnings / 600; // 6 months in cents
  const projectedAnnual = (averageMonthlyEarnings * 12) / 100;

  const rateHistory = assignments.map(a => ({
    month: new Date(a.completedAt || new Date()).toISOString().slice(0, 7),
    rate: totalHours > 0 ? ((a.earnedCent || 0) / 100) / (a.durationMinutes / 60) : 0,
  }));

  const summerAvg = assignments.filter(a => {
    const m = new Date(a.completedAt || new Date()).getMonth();
    return m >= 5 && m <= 7;
  }).reduce((sum, a) => sum + (a.earnedCent || 0), 0);

  const winterAvg = assignments.filter(a => {
    const m = new Date(a.completedAt || new Date()).getMonth();
    return m >= 11 || m <= 2;
  }).reduce((sum, a) => sum + (a.earnedCent || 0), 0);

  const seasonalTrend = summerAvg > winterAvg ? 'PEAK_SUMMER' : 'PEAK_WINTER';

  return {
    workerId,
    currentHourlyRate: Math.round(currentHourlyRate * 100) / 100,
    averageMonthlyEarnings: Math.round(averageMonthlyEarnings) / 100,
    rateHistory,
    seasonalTrend,
    projectedAnnual: Math.round(projectedAnnual * 100) / 100,
  };
}
