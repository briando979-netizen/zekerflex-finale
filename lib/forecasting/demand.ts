import { prisma } from "@/lib/prisma";

export async function predictDemand(productId: string, months: number = 12) {
  const history = await prisma.saleHistory.findMany({
    where: { productId },
    orderBy: { date: "asc" },
    take: 24,
  });

  const avgGrowth = 0.08;
  const seasonalFactors = [1.0, 0.95, 0.92, 0.88, 1.1, 1.15, 1.2, 1.18, 1.05, 0.98, 1.02, 1.22];
  
  const predictions = [];
  const lastValue = history[history.length - 1]?.quantity || 100;

  for (let i = 0; i < months; i++) {
    const trend = lastValue * Math.pow(1 + avgGrowth, i);
    const seasonal = seasonalFactors[i % 12];
    const noise = (Math.random() - 0.5) * lastValue * 0.05;
    predictions.push(Math.round(trend * seasonal + noise));
  }

  return predictions;
}

export async function forecastWithScenarios(productId: string) {
  const baseCase = await predictDemand(productId);
  const optimisticGrowth = baseCase.map((v, i) => Math.round(v * (1 + 0.02 * i)));
  const pessimisticGrowth = baseCase.map((v, i) => Math.round(v * (1 - 0.01 * i)));
  return { baseCase, optimisticGrowth, pessimisticGrowth };
}
