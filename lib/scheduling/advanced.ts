import { prisma } from "@/lib/prisma";

export async function scheduleResources(projectId: string) {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { projectId },
    include: { resource: true },
    orderBy: { priority: "asc" },
  });

  const scheduled: typeof allocations = [];
  const conflicts: Array<{ res1: string; res2: string }> = [];

  for (const allocation of allocations) {
    const isConflict = scheduled.some(
      (s) =>
        s.resourceId === allocation.resourceId &&
        s.startDate < allocation.endDate &&
        s.endDate > allocation.startDate
    );

    if (isConflict) {
      conflicts.push({ res1: allocation.resourceId, res2: allocation.resourceId });
    } else {
      scheduled.push(allocation);
    }
  }

  return { scheduled, conflicts };
}

export async function resolveConflicts(projectId: string) {
  const { conflicts, scheduled } = await scheduleResources(projectId);

  const resolved = scheduled.map((s, idx) => ({
    ...s,
    adjustedStart: new Date(s.startDate.getTime() + idx * 24 * 60 * 60 * 1000),
  }));

  return { resolved, conflictsResolved: conflicts.length };
}

export async function optimizeSchedule(projectId: string) {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { projectId },
  });

  const sorted = allocations.sort((a, b) => {
    const scoreA = a.priority * 0.4 + (a.allocated / a.resource?.capacity || 1) * 0.6;
    const scoreB = b.priority * 0.4 + (b.allocated / b.resource?.capacity || 1) * 0.6;
    return scoreB - scoreA;
  });

  return sorted;
}

export async function balanceLoad(resourceId: string) {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { resourceId },
  });

  const avgLoad = allocations.reduce((sum, a) => sum + a.allocated, 0) / allocations.length;
  const imbalanced = allocations.filter((a) => Math.abs(a.allocated - avgLoad) > avgLoad * 0.2);

  return {
    avgLoad,
    imbalancedCount: imbalanced.length,
    recommendations: imbalanced.map((a) => ({
      allocation: a.id,
      currentLoad: a.allocated,
      targetLoad: avgLoad,
      adjustment: avgLoad - a.allocated,
    })),
  };
}

export async function priorityManagement(projectId: string) {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { projectId },
    orderBy: { priority: "asc" },
  });

  return allocations.map((a, idx) => ({
    ...a,
    urgency: idx === 0 ? "CRITICAL" : idx < 3 ? "HIGH" : "NORMAL",
  }));
}

export async function autoSchedule(projectId: string) {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { projectId },
  });

  const scheduled = allocations.map((a, idx) => ({
    ...a,
    autoStart: new Date(Date.now() + idx * 7 * 24 * 60 * 60 * 1000),
    autoEnd: new Date(Date.now() + (idx + 1) * 7 * 24 * 60 * 60 * 1000),
  }));

  return { scheduled, totalDuration: allocations.length * 7 };
}
