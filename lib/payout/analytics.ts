import { prisma } from '@/lib/prisma';

export async function getPayoutAnalytics(freelancerId: string, days: number = 90) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const payouts = await prisma.instantPayout.findMany({
    where: {
      freelancerId,
      completedAt: { gte: since },
      status: 'COMPLETED',
    },
  });

  const totalVolume = payouts.reduce((sum, p) => sum + p.amount, 0);
  const averagePayout = payouts.length > 0 ? totalVolume / payouts.length : 0;
  const maxPayout = payouts.length > 0 ? Math.max(...payouts.map(p => p.amount)) : 0;
  const minPayout = payouts.length > 0 ? Math.min(...payouts.map(p => p.amount)) : 0;

  // Group by date
  const volumeByDate = new Map<string, number>();
  for (const payout of payouts) {
    const date = payout.completedAt?.toISOString().split('T')[0] || '';
    volumeByDate.set(date, (volumeByDate.get(date) || 0) + payout.amount);
  }

  // Frequency trends
  const frequencyTrend = payouts.length > 0 ? Math.round((payouts.length / days) * 7) : 0; // payouts per week

  return {
    periodDays: days,
    totalVolume: Math.round(totalVolume * 100) / 100,
    totalPayouts: payouts.length,
    averagePayout: Math.round(averagePayout * 100) / 100,
    maxPayout,
    minPayout,
    frequencyPerWeek: frequencyTrend,
    volumeByDate: Object.fromEntries(volumeByDate),
  };
}

export async function getPlatformPayoutMetrics(days: number = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const payouts = await prisma.instantPayout.findMany({
    where: {
      completedAt: { gte: since },
      status: 'COMPLETED',
    },
  });

  const totalVolume = payouts.reduce((sum, p) => sum + p.amount, 0);
  const uniqueFreelancers = new Set(payouts.map(p => p.freelancerId)).size;

  return {
    totalPayoutVolume: Math.round(totalVolume * 100) / 100,
    payoutCount: payouts.length,
    uniqueFreelancers,
    averagePayoutSize: payouts.length > 0 ? Math.round((totalVolume / payouts.length) * 100) / 100 : 0,
  };
}

export async function getPayoutTrends(freelancerId: string, monthCount: number = 6) {
  const trends = [];

  for (let i = monthCount - 1; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    const payouts = await prisma.instantPayout.findMany({
      where: {
        freelancerId,
        completedAt: { gte: monthStart, lte: monthEnd },
        status: 'COMPLETED',
      },
    });

    const volume = payouts.reduce((sum, p) => sum + p.amount, 0);
    trends.push({
      month: monthStart.toISOString().split('T')[0],
      volume: Math.round(volume * 100) / 100,
      payoutCount: payouts.length,
    });
  }

  return trends;
}
