import { prisma } from "@/lib/prisma";
import { z } from "zod";

const maintenanceSchema = z.object({
  assetId: z.string(),
  type: z.enum(["PREVENTIVE", "REACTIVE", "EMERGENCY"]),
  description: z.string(),
  scheduledDate: z.date().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});

export async function createMaintenanceTask(data: z.infer<typeof maintenanceSchema>) {
  const validated = maintenanceSchema.parse(data);
  return prisma.maintenanceTask.create({
    data: { ...validated, status: "SCHEDULED", createdAt: new Date() },
  });
}

export async function schedulePreventiveMaintenance(assetId: string, interval: "MONTHLY" | "QUARTERLY" | "ANNUALLY") {
  const asset = await prisma.facilityAsset.findUniqueOrThrow({ where: { id: assetId } });
  const nextDate = getNextMaintenanceDate(interval);

  return prisma.maintenanceSchedule.create({
    data: { assetId, type: "PREVENTIVE", interval, nextScheduled: nextDate },
  });
}

function getNextMaintenanceDate(interval: string): Date {
  const now = new Date();
  const days = { MONTHLY: 30, QUARTERLY: 90, ANNUALLY: 365 }[interval] || 30;
  return new Date(now.getTime() + days * 86400000);
}

export async function completeMaintenanceTask(taskId: string, notes: string, completedBy: string) {
  return prisma.maintenanceTask.update({
    where: { id: taskId },
    data: { status: "COMPLETED", notes, completedBy, completedAt: new Date() },
  });
}

export async function trackMaintenanceHistory(assetId: string) {
  return prisma.maintenanceTask.findMany({
    where: { assetId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    take: 50,
  });
}

export async function calculateMaintenanceCosts(assetId: string, months: number = 12) {
  const tasks = await prisma.maintenanceTask.findMany({
    where: {
      assetId,
      status: "COMPLETED",
      completedAt: { gte: new Date(Date.now() - months * 30 * 86400000) },
    },
  });

  const totalCost = tasks.reduce((sum, t) => sum + (t.cost || 0), 0);
  return { totalCost, taskCount: tasks.length, avgCostPerTask: totalCost / tasks.length || 0 };
}
