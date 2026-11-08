import { prisma } from "@/lib/prisma";

export async function optimizeResources(projectId: string) {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { projectId },
    include: { resource: true },
  });

  const optimized = allocations.map((a) => {
    const currentCost = a.allocated * a.resource.costPerUnit;
    const utilized = a.utilized;
    const waste = a.allocated - utilized;
    const wasteCost = waste * a.resource.costPerUnit;

    return {
      ...a,
      optimalAllocation: utilized * 1.1,
      costSavings: wasteCost,
      recommendedAction: waste > utilized * 0.2 ? "REDUCE" : "MAINTAIN",
    };
  });

  const totalSavings = optimized.reduce((sum, o) => sum + o.costSavings, 0);

  return { optimized, totalSavings };
}

export async function minimizeCosts(projectId: string) {
  const { optimized } = await optimizeResources(projectId);

  const costOptimized = optimized
    .filter((o) => o.recommendedAction === "REDUCE")
    .map((o) => ({
      ...o,
      newAllocation: o.utilized,
      costReduction: o.allocated * o.resource.costPerUnit - o.utilized * o.resource.costPerUnit,
    }));

  const totalReduction = costOptimized.reduce((sum, c) => sum + c.costReduction, 0);

  return { costOptimized, totalReduction };
}

export async function maximizeUtilization(resourceId: string) {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { resourceId },
  });

  const avgUtilization = allocations.reduce((sum, a) => sum + a.utilized, 0) / allocations.length;
  const underutilized = allocations.filter((a) => a.utilized < avgUtilization * 0.8);

  const recommendations = underutilized.map((a) => ({
    allocation: a.id,
    currentUtilization: a.utilized,
    targetUtilization: avgUtilization,
    upliftPotential: avgUtilization - a.utilized,
  }));

  return { recommendations, totalUplift: recommendations.reduce((sum, r) => sum + r.upliftPotential, 0) };
}

export async function balanceRisk(projectId: string) {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { projectId },
    include: { resource: true },
  });

  const riskScore = allocations.map((a) => {
    const utilizationRisk = a.utilized / a.allocated > 0.9 ? 10 : a.utilized / a.allocated > 0.7 ? 5 : 0;
    const availabilityRisk = (1 - a.resource.availability / 100) * 10;
    return { allocation: a.id, riskScore: utilizationRisk + availabilityRisk };
  });

  const highRisk = riskScore.filter((r) => r.riskScore > 12);

  return { riskScores: riskScore, highRiskCount: highRisk.length, mitigationNeeded: highRisk };
}

export async function scenarioModeling(projectId: string, variables: { costMultiplier: number; timeMultiplier: number }) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { allocations: { include: { resource: true } } },
  });

  if (!project) return null;

  const baseCost = project.allocations.reduce((sum, a) => sum + a.utilized * a.resource.costPerUnit, 0);
  const scenarioCost = baseCost * variables.costMultiplier;
  const scenarioTime = (project.endDate.getTime() - project.startDate.getTime()) / (1000 * 60 * 60 * 24) * variables.timeMultiplier;

  return {
    baselineScenario: { cost: baseCost, duration: project.endDate.getTime() - project.startDate.getTime() },
    optimizedScenario: { cost: scenarioCost, duration: scenarioTime },
    savings: baseCost - scenarioCost,
  };
}

export async function recommendations(projectId: string) {
  const costOpt = await minimizeCosts(projectId);
  const utilOpt = await maximizeUtilization(projectId);
  const riskOpt = await balanceRisk(projectId);

  return {
    costRecommendations: costOpt.totalReduction > 0 ? `Reduce costs by $${costOpt.totalReduction}` : "No cost reductions available",
    utilizationRecommendations: utilOpt.totalUplift > 0 ? `Increase utilization by ${utilOpt.totalUplift}` : "Utilization optimal",
    riskRecommendations: riskOpt.highRiskCount > 0 ? `Mitigate ${riskOpt.highRiskCount} high-risk allocations` : "Risk profile acceptable",
  };
}
