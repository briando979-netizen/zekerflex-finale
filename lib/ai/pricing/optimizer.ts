import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/ops/logger";

interface DynamicPrice {
  basePrice: number;
  adjustedPrice: number;
  factors: Record<string, number>;
  multiplier: number;
}

export async function computeDynamicPrice(itemId: string, context: any): Promise<DynamicPrice> {
  try {
    const item = await prisma.shift.findUnique({ where: { id: itemId } });
    if (!item) throw new Error("Item not found");

    const basePrice = item.hourlyRate || 50;

    // Demand multiplier
    const demandMultiplier = await computeDemandMultiplier(itemId);

    // Time multiplier (peak vs off-peak)
    const timeMultiplier = computeTimeMultiplier(item.startTime);

    // Scarcity multiplier
    const scarcityMultiplier = await computeScarcityMultiplier(itemId);

    // Market conditions
    const marketMultiplier = await computeMarketMultiplier();

    const multiplier = demandMultiplier * timeMultiplier * scarcityMultiplier * marketMultiplier;
    const adjustedPrice = Math.round(basePrice * multiplier * 100) / 100;

    return {
      basePrice,
      adjustedPrice,
      factors: {
        demand: demandMultiplier,
        time: timeMultiplier,
        scarcity: scarcityMultiplier,
        market: marketMultiplier,
      },
      multiplier,
    };
  } catch (err) {
    logger.error("Dynamic pricing computation failed", { itemId, err });
    return { basePrice: 50, adjustedPrice: 50, factors: {}, multiplier: 1 };
  }
}

async function computeDemandMultiplier(itemId: string): Promise<number> {
  const applications = await prisma.shift.count({
    where: { id: itemId, assignments: { some: {} } },
  });

  return Math.min(1.5, 1 + applications / 100);
}

function computeTimeMultiplier(startTime: Date): number {
  const hour = startTime.getHours();
  const isPeakHour = [7, 12, 17, 18, 19, 20].includes(hour);

  return isPeakHour ? 1.2 : 0.9;
}

async function computeScarcityMultiplier(itemId: string): Promise<number> {
  const item = await prisma.shift.findUnique({ where: { id: itemId } });
  if (!item) return 1;

  const filled = item.requiredWorkers;
  const available = filled > 0 ? 1 : 1.3;

  return available;
}

async function computeMarketMultiplier(): Promise<number> {
  // Based on general market conditions
  return 1.0;
}

export async function optimizeMargin(cost: number, demand: number): Promise<number> {
  const elasticity = -1.5;
  const demandChange = demand / 100;

  return cost * (1 + (demandChange * elasticity * 0.1));
}

export async function forecastDemand(itemId: string, days: number = 30): Promise<number[]> {
  const shift = await prisma.shift.findUnique({ where: { id: itemId } });
  if (!shift) return [];

  // Simple trending forecast
  const forecast: number[] = [];
  for (let i = 0; i < days; i++) {
    forecast.push(Math.random() * 100 + 50);
  }

  return forecast;
}
