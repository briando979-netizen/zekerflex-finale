import { prisma } from "@/lib/prisma";

export async function forecastCapacity(resourceId: string, months: number = 12) {
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    include: { allocations: true },
  });

  if (!resource) return null;

  const forecast = [];
  const now = new Date();

  for (let m = 0; m < months; m++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const allocationsInMonth = resource.allocations.filter(
      (a) => a.startDate.getMonth() === monthDate.getMonth() &&
             a.startDate.getFullYear() === monthDate.getFullYear()
    );

    const demand = allocationsInMonth.reduce((sum, a) => sum + a.allocated, 0);
    const available = resource.capacity - demand;
    const utilization = (demand / resource.capacity) * 100;

    forecast.push({
      month: monthDate,
      demand,
      available,
      utilization,
      surplus: available > 0,
      bottleneck: utilization > 90,
    });
  }

  return forecast;
}

export async function detectBottlenecks(projectId: string) {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { projectId },
    include: { resource: true },
  });

  const bottlenecks = allocations.filter((a) => {
    const util = (a.utilized / a.allocated) * 100;
    return util > 85;
  });

  return bottlenecks.map((b) => ({
    resource: b.resource.name,
    utilization: (b.utilized / b.allocated) * 100,
    excess: b.allocated - b.utilized,
  }));
}

export async function projectGrowth(resourceId: string, forecastMonths: number = 24) {
  const forecast = await forecastCapacity(resourceId, forecastMonths);
  if (!forecast) return null;

  const trend = forecast.map((f) => f.utilization);
  const avgGrowth = (trend[trend.length - 1] - trend[0]) / forecastMonths;
  const projectedCapacityNeeded = Math.ceil(
    (trend[trend.length - 1] / 100) * (await prisma.resource.findUnique({ where: { id: resourceId } }))?.capacity || 0
  );

  return { trend, avgGrowth, projectedCapacityNeeded };
}

export async function contingencyPlanning(resourceId: string) {
  const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
  if (!resource) return null;

  const criticalThreshold = resource.capacity * 0.8;
  const warningThreshold = resource.capacity * 0.6;

  return {
    critical: resource.allocated >= criticalThreshold,
    warning: resource.allocated >= warningThreshold && resource.allocated < criticalThreshold,
    contingency: {
      escalate: resource.allocated >= criticalThreshold,
      alternatives: resource.skills || [],
      backup: resource.type === "TEAM",
    },
  };
}
