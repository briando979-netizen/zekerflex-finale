import { prisma } from "@/lib/prisma";

export async function forecastResourceDemand(projectId: string) {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { projectId },
    include: { resource: true },
  });

  const demandByMonth: Record<string, number> = {};
  allocations.forEach((a) => {
    const monthKey = `${a.startDate.getFullYear()}-${a.startDate.getMonth() + 1}`;
    demandByMonth[monthKey] = (demandByMonth[monthKey] || 0) + a.allocated;
  });

  return demandByMonth;
}

export async function timelineImpact(projectId: string, resourceDelay: number) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { allocations: true },
  });

  if (!project) return null;

  const criticalPath = project.allocations.reduce((max, a) => Math.max(max, a.endDate.getTime()), 0);
  const newEndDate = new Date(criticalPath + resourceDelay * 24 * 60 * 60 * 1000);

  return {
    originalEnd: new Date(criticalPath),
    delayedEnd: newEndDate,
    delaySdays: resourceDelay,
    costImpact: project.budget * (resourceDelay / 30) * 0.1,
  };
}

export async function costProjection(projectId: string) {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { projectId },
    include: { resource: true },
  });

  const projectedCost = allocations.reduce((sum, a) => sum + a.resource.costPerUnit * a.allocated, 0);
  const actualCost = allocations.reduce((sum, a) => sum + a.resource.costPerUnit * a.utilized, 0);

  return {
    projectedCost,
    actualCost,
    variance: projectedCost - actualCost,
    variancePercent: ((projectedCost - actualCost) / projectedCost) * 100,
  };
}

export async function riskAssessment(projectId: string) {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { projectId, status: "ACTIVE" },
  });

  const risks = {
    overallocation: allocations.filter((a) => a.allocated > a.resource.capacity * 0.9).length > 0,
    conflicts: allocations.length > 5 ? "HIGH" : allocations.length > 2 ? "MEDIUM" : "LOW",
    schedule: allocations.some((a) => a.endDate < new Date()) ? "CRITICAL" : "OK",
  };

  return risks;
}

export async function scenarioPlanning(projectId: string, scenarios: Array<{ name: string; adjustment: number }>) {
  const base = await costProjection(projectId);

  return scenarios.map((s) => ({
    scenario: s.name,
    cost: base.projectedCost * (1 + s.adjustment),
    impact: base.projectedCost * s.adjustment,
  }));
}
