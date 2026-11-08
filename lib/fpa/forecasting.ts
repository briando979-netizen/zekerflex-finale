import { prisma } from "@/lib/prisma";
import { z } from "zod";

const forecastSchema = z.object({
  entityId: z.string(),
  period: z.string(),
  revenueBase: z.number(),
  revenueGrowth: z.number().default(0.05),
  expenseBase: z.number(),
  expenseGrowth: z.number().default(0.03),
  seasonality: z.record(z.number()).optional(),
});

export async function forecastFinancials(input: z.infer<typeof forecastSchema>) {
  const validated = forecastSchema.parse(input);

  const months = 12;
  const forecasts = [];

  for (let m = 0; m < months; m++) {
    const monthKey = new Date(new Date(validated.period).getFullYear(), m, 1).toISOString().slice(0, 7);
    const seasonalFactor = validated.seasonality?.[monthKey] ?? 1;

    const revenue = validated.revenueBase * Math.pow(1 + validated.revenueGrowth, m) * seasonalFactor;
    const expense = validated.expenseBase * Math.pow(1 + validated.expenseGrowth, m) * seasonalFactor;
    const cashFlow = revenue - expense;

    forecasts.push({
      entityId: validated.entityId,
      period: monthKey,
      revenue,
      expense,
      cashFlow,
      margin: revenue > 0 ? ((revenue - expense) / revenue) * 100 : 0,
    });
  }

  return forecasts;
}

export async function saveForecast(entityId: string, forecasts: any[]) {
  return prisma.financialForecast.createMany({
    data: forecasts.map(f => ({
      entityId,
      period: f.period,
      revenue: f.revenue,
      expense: f.expense,
      cashFlow: f.cashFlow,
      margin: f.margin,
    })),
  });
}
