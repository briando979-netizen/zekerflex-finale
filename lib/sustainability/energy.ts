import { prisma } from '@/lib/prisma';

export async function recordEnergyUsage(kwh: number, source: 'grid' | 'solar' | 'wind', date: Date) {
  return prisma.energyUsage.create({
    data: { kwh, source, date, kwhCo2: kwh * (source === 'grid' ? 0.4 : 0.01) },
  });
}

export async function getEnergyEfficiency(startDate: Date, endDate: Date) {
  const usage = await prisma.energyUsage.findMany({
    where: { date: { gte: startDate, lte: endDate } },
  });

  const totalKwh = usage.reduce((s, u) => s + u.kwh, 0);
  const renewableKwh = usage.filter(u => u.source !== 'grid').reduce((s, u) => s + u.kwh, 0);

  return {
    totalKwh,
    renewablePercentage: (renewableKwh / totalKwh) * 100,
    gridEmissions: (totalKwh - renewableKwh) * 0.4,
    recommendations: ['Install solar panels', 'Upgrade to LED', 'Optimize HVAC'],
  };
}
