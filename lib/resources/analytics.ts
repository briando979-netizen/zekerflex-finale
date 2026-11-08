import { prisma } from "@/lib/prisma";

export async function utilizationReport(resourceId: string) {
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    include: { allocations: true },
  });

  if (!resource) return null;

  const totalCapacity = resource.capacity * 30 * 8; // 30 days, 8 hours/day
  const totalUtilized = resource.allocations.reduce((sum, a) => sum + a.utilized, 0);
  const utilization = (totalUtilized / totalCapacity) * 100;

  return {
    resource: resource.name,
    capacity: resource.capacity,
    utilized: totalUtilized,
    available: totalCapacity - totalUtilized,
    utilizationPercent: utilization,
    efficiency: utilization > 80 ? "OPTIMAL" : utilization > 60 ? "GOOD" : "UNDERUTILIZED",
  };
}

export async function efficiencyMetrics(projectId: string) {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { projectId },
  });

  const efficiency = allocations.map((a) => ({
    resource: a.resourceId,
    efficiency: (a.utilized / a.allocated) * 100,
    waste: a.allocated - a.utilized,
  }));

  const avgEfficiency = efficiency.reduce((sum, e) => sum + e.efficiency, 0) / efficiency.length;

  return { efficiency, avgEfficiency };
}

export async function costAnalysis(resourceId: string) {
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    include: { allocations: true },
  });

  if (!resource) return null;

  const allocatedCost = resource.allocations.reduce((sum, a) => sum + a.allocated * resource.costPerUnit, 0);
  const utilizedCost = resource.allocations.reduce((sum, a) => sum + a.utilized * resource.costPerUnit, 0);
  const wastedCost = allocatedCost - utilizedCost;

  return {
    allocatedCost,
    utilizedCost,
    wastedCost,
    wastedPercent: (wastedCost / allocatedCost) * 100,
    roiPercent: ((utilizedCost - wastedCost) / allocatedCost) * 100,
  };
}

export async function roiAnalysis(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { allocations: { include: { resource: true } } },
  });

  if (!project) return null;

  const cost = project.allocations.reduce((sum, a) => sum + a.utilized * a.resource.costPerUnit, 0);
  const revenue = project.revenue || 0;
  const roi = ((revenue - cost) / cost) * 100;

  return { cost, revenue, roi, paybackMonths: roi > 0 ? (cost / (revenue / 12)) : null };
}

export async function trendAnalysis(resourceId: string, months: number = 12) {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { resourceId },
  });

  const trends: Record<string, number> = {};
  allocations.forEach((a) => {
    const monthKey = `${a.startDate.getFullYear()}-${a.startDate.getMonth() + 1}`;
    trends[monthKey] = (trends[monthKey] || 0) + a.utilized;
  });

  const sorted = Object.entries(trends).sort();
  const growth = sorted.length > 1 ? ((sorted[sorted.length - 1][1] - sorted[0][1]) / sorted[0][1]) * 100 : 0;

  return { trends: Object.fromEntries(sorted), growth, trend: growth > 0 ? "INCREASING" : "DECREASING" };
}

export async function benchmarking(resourceId: string) {
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    include: { allocations: true },
  });

  if (!resource) return null;

  const industryAvg = 70; // Benchmark
  const currentUtil = (resource.allocated / resource.capacity) * 100;
  const benchmark = currentUtil - industryAvg;

  return {
    current: currentUtil,
    industryAvg,
    benchmark,
    status: benchmark > 0 ? "ABOVE AVERAGE" : "BELOW AVERAGE",
  };
}
