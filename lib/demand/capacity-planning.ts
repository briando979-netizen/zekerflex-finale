import { prisma } from "@/lib/prisma";

interface CapacityPlan {
  date: Date;
  hour: number;
  demandShifts: number;
  availableWorkers: number;
  gap: number;
  utilizationRate: number;
  recommendation: string;
}

export async function planCapacity(tenantId: string, date: Date): Promise<CapacityPlan[]> {
  const plans: CapacityPlan[] = [];

  for (let hour = 0; hour < 24; hour++) {
    const demandShifts = await getOpenShiftCount(tenantId, date, hour);
    const availableWorkers = await getAvailableWorkerCount(tenantId, date, hour);
    const gap = Math.max(0, demandShifts - availableWorkers);
    const utilizationRate = availableWorkers > 0 ? demandShifts / availableWorkers : 0;

    let recommendation = "OK";
    if (gap > 10) recommendation = "CRITICAL - recruit immediately";
    else if (gap > 5) recommendation = "HIGH - offer bonus pricing";
    else if (utilizationRate > 1.2) recommendation = "SURGE - apply dynamic pricing";
    else if (availableWorkers > demandShifts * 1.5) recommendation = "SURPLUS - reduce hours or shift times";

    plans.push({
      date: new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour),
      hour,
      demandShifts,
      availableWorkers,
      gap,
      utilizationRate,
      recommendation,
    });
  }

  return plans;
}

async function getOpenShiftCount(tenantId: string, date: Date, hour: number): Promise<number> {
  return await prisma.shift.count({
    where: {
      tenantId,
      startsAt: {
        gte: new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour),
        lt: new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour + 1),
      },
      status: "OPEN",
    },
  });
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

export async function getCapacityGaps(tenantId: string, days: number = 7): Promise<Array<{ date: Date; hour: number; gap: number }>> {
  const gaps: Array<{ date: Date; hour: number; gap: number }> = [];

  for (let d = 0; d < days; d++) {
    const date = new Date(Date.now() + d * 24 * 60 * 60 * 1000);
    const plan = await planCapacity(tenantId, date);

    for (const p of plan) {
      if (p.gap > 0) {
        gaps.push({ date: p.date, hour: p.hour, gap: p.gap });
      }
    }
  }

  return gaps;
}

export async function suggestStaffingActions(tenantId: string, date: Date): Promise<string[]> {
  const plan = await planCapacity(tenantId, date);
  const actions: string[] = [];

  const criticalHours = plan.filter((p) => p.gap > 10);
  if (criticalHours.length > 0) {
    actions.push(`Critical gaps at hours: ${criticalHours.map((h) => h.hour).join(", ")}`);
  }

  const surgeHours = plan.filter((p) => p.utilizationRate > 1.2);
  if (surgeHours.length > 0) {
    actions.push(`Apply surge pricing for hours: ${surgeHours.map((h) => h.hour).join(", ")}`);
  }

  const surplusHours = plan.filter((p) => p.availableWorkers > p.demandShifts * 1.5);
  if (surplusHours.length > 0) {
    actions.push(`Excess capacity at hours: ${surplusHours.map((h) => h.hour).join(", ")} - consider reducing shifts`);
  }

  return actions;
}
