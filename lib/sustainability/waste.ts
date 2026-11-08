import { prisma } from '@/lib/prisma';

export async function recordWaste(kg: number, type: 'hazardous' | 'recyclable' | 'compost', date: Date) {
  return prisma.wasteRecord.create({
    data: { kg, type, date },
  });
}

export async function getWasteReduction(startDate: Date, endDate: Date) {
  const waste = await prisma.wasteRecord.findMany({
    where: { date: { gte: startDate, lte: endDate } },
  });

  const total = waste.reduce((s, w) => s + w.kg, 0);
  const recyclable = waste.filter(w => w.type === 'recyclable').reduce((s, w) => s + w.kg, 0);

  return {
    totalKg: total,
    recycledPercentage: (recyclable / total) * 100,
    goals: [
      { name: 'Zero Waste to Landfill', target: 2025 },
      { name: '95% Recycling Rate', target: 2026 },
    ],
  };
}
