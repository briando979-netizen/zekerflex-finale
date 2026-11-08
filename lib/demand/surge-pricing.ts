import { prisma } from "@/lib/prisma";

interface SurgePricingData {
  hour: number;
  demandLevel: "low" | "normal" | "high" | "peak";
  supplyLevel: "high" | "normal" | "low" | "critical";
  surgeFactor: number;
  suggestedPrice: number;
}

export async function calculateSurgePricing(
  tenantId: string,
  date: Date,
  hour: number,
  basePrice: number
): Promise<SurgePricingData> {
  // Get demand forecast
  const demand = await getDemandLevel(tenantId, date, hour);

  // Get available workers
  const availableWorkers = await getAvailableWorkerCount(tenantId, date, hour);
  const supply = calculateSupplyLevel(availableWorkers, demand);

  const surgeFactor = calculateSurgeFactor(demand, supply);
  const adjustedPrice = Math.round(basePrice * surgeFactor);

  return {
    hour,
    demandLevel: demand,
    supplyLevel: supply,
    surgeFactor,
    suggestedPrice: adjustedPrice,
  };
}

async function getDemandLevel(tenantId: string, date: Date, hour: number): Promise<"low" | "normal" | "high" | "peak"> {
  const openShifts = await prisma.shift.count({
    where: {
      tenantId,
      startsAt: {
        gte: new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour),
        lt: new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour + 1),
      },
      status: "OPEN",
    },
  });

  if (openShifts > 50) return "peak";
  if (openShifts > 30) return "high";
  if (openShifts > 10) return "normal";
  return "low";
}

async function getAvailableWorkerCount(tenantId: string, date: Date, hour: number): Promise<number> {
  return await prisma.freelancerProfile.count({
    where: {
      user: {
        tenants: {
          some: {
            tenantId,
            role: "FREELANCER",
          },
        },
      },
      assignments: {
        none: {
          startsAt: {
            gte: new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour),
            lt: new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour + 1),
          },
          status: { in: ["ACCEPTED", "CONFIRMED"] },
        },
      },
    },
  });
}

function calculateSupplyLevel(availableWorkers: number, demand: string): "high" | "normal" | "low" | "critical" {
  const demandCount = { low: 5, normal: 15, high: 35, peak: 60 }[demand] ?? 20;
  const ratio = availableWorkers / demandCount;

  if (ratio > 1.5) return "high";
  if (ratio > 0.8) return "normal";
  if (ratio > 0.3) return "low";
  return "critical";
}

function calculateSurgeFactor(demand: string, supply: string): number {
  const factors: Record<string, Record<string, number>> = {
    low: { high: 0.7, normal: 0.8, low: 0.9, critical: 1.0 },
    normal: { high: 0.9, normal: 1.0, low: 1.1, critical: 1.3 },
    high: { high: 1.0, normal: 1.2, low: 1.5, critical: 2.0 },
    peak: { high: 1.1, normal: 1.5, low: 2.0, critical: 2.5 },
  };

  return factors[demand]?.[supply] ?? 1.0;
}

export async function maxSurgePrice(basePrice: number): Promise<number> {
  return Math.round(basePrice * 2.5); // Cap surge at 2.5x
}

export async function minPrice(basePrice: number): Promise<number> {
  return Math.round(basePrice * 0.6); // Floor at 0.6x
}
