import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const emissionRecordSchema = z.object({
  scope: z.enum(['SCOPE_1', 'SCOPE_2', 'SCOPE_3']),
  category: z.string(),
  amount: z.number().positive(),
  unit: z.enum(['kg_co2', 'metric_tons']),
  source: z.string(),
  date: z.string().datetime(),
});

export async function recordEmission(data: z.infer<typeof emissionRecordSchema>) {
  const validated = emissionRecordSchema.parse(data);
  const kgCo2 = validated.unit === 'metric_tons' ? validated.amount * 1000 : validated.amount;

  return prisma.emissionRecord.create({
    data: {
      ...validated,
      kgCo2Equivalent: kgCo2,
    },
  });
}

export async function getEmissionsByScope(scope: string, startDate: Date, endDate: Date) {
  const records = await prisma.emissionRecord.findMany({
    where: { scope, date: { gte: startDate, lte: endDate } },
  });

  const total = records.reduce((sum, r) => sum + r.kgCo2Equivalent, 0);
  return { records, totalKgCo2: total, totalMetricTons: total / 1000 };
}

export async function getEmissionsTrend(months = 12) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const records = await prisma.emissionRecord.findMany({
    where: { date: { gte: startDate } },
    orderBy: { date: 'asc' },
  });

  const monthlyTotals = new Map<string, number>();
  records.forEach(r => {
    const key = r.date.toISOString().slice(0, 7);
    monthlyTotals.set(key, (monthlyTotals.get(key) || 0) + r.kgCo2Equivalent);
  });

  return Array.from(monthlyTotals.entries()).map(([month, total]) => ({
    month,
    metricTons: total / 1000,
  }));
}
