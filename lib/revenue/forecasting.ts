import { prisma } from "@/lib/prisma";

export async function forecastRevenue(
  productId: string,
  months: number = 12,
  historicalData: { month: number; revenue: number }[]
) {
  const avgGrowth = historicalData.length > 1
    ? (historicalData[historicalData.length - 1].revenue - historicalData[0].revenue) / historicalData.length
    : 0;

  const forecast = [];
  let lastRevenue = historicalData[historicalData.length - 1]?.revenue || 0;

  for (let i = 1; i <= months; i++) {
    const projected = lastRevenue + avgGrowth * (1 + Math.random() * 0.1);
    forecast.push({ month: i, revenue: Math.max(0, projected) });
    lastRevenue = projected;
  }

  return forecast;
}

export async function scenarioPlanning(
  productId: string,
  scenarios: { name: string; growthRate: number; marketChange: number }[]
) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { price: true } });
  if (!product) throw new Error("Product not found");

  return scenarios.map(s => ({
    scenario: s.name,
    projectedRevenue: product.price * (1 + s.growthRate) * (1 + s.marketChange),
  }));
}

export async function whatIfAnalysis(baseRevenue: number, changes: Record<string, number>) {
  let result = baseRevenue;
  for (const [factor, change] of Object.entries(changes)) {
    result *= (1 + change);
  }
  return { baseRevenue, projected: result, delta: result - baseRevenue };
}
