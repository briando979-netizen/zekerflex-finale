import { prisma } from "@/lib/prisma";

export async function recordEnergyConsumption(spaceId: string, consumption: number, unit: string = "kWh") {
  return prisma.energyConsumption.create({
    data: { spaceId, consumption, unit, recordedAt: new Date() },
  });
}

export async function getEnergyEfficiency(spaceId: string, days: number = 30) {
  const records = await prisma.energyConsumption.findMany({
    where: {
      spaceId,
      recordedAt: { gte: new Date(Date.now() - days * 86400000) },
    },
    orderBy: { recordedAt: "desc" },
  });

  if (records.length === 0) return { avgDaily: 0, trend: "NO_DATA", efficiency: 0 };

  const totalConsumption = records.reduce((sum, r) => sum + r.consumption, 0);
  const avgDaily = totalConsumption / Math.ceil(days);
  const trend = records.length > 1 && records[0].consumption < records[records.length - 1].consumption ? "DECREASING" : "INCREASING";

  return { avgDaily, trend, totalConsumption, recordCount: records.length };
}

export async function optimizeEnergyUsage(spaceId: string) {
  const efficiency = await getEnergyEfficiency(spaceId, 30);
  const recommendations = [];

  if (efficiency.avgDaily > 100) recommendations.push("Reduce peak usage - consider scheduling high-load activities");
  if (efficiency.trend === "INCREASING") recommendations.push("Energy consumption is increasing - audit for inefficiencies");
  if (efficiency.avgDaily < 20) recommendations.push("Consider consolidating operations to improve efficiency");

  return { efficiency, recommendations };
}

export async function trackEnergyGoals(spaceId: string, targetConsumption: number) {
  const current = await getEnergyEfficiency(spaceId, 30);
  const variance = ((current.avgDaily - targetConsumption) / targetConsumption) * 100;

  return {
    target: targetConsumption,
    actual: current.avgDaily,
    variance,
    onTrack: variance <= 10,
    status: variance > 10 ? "EXCEEDING" : variance < -10 ? "UNDER" : "ON_TRACK",
  };
}
