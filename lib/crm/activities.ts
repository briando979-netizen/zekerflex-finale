import { prisma } from "@/lib/prisma";
import { ActivityType } from "@prisma/client";
import { z } from "zod";

export const crmActivitySchema = z.object({
  contactId: z.string(),
  dealId: z.string().optional(),
  type: z.nativeEnum(ActivityType),
  title: z.string().min(1),
  notes: z.string().optional(),
  duration: z.number().int().optional(),
  dueDate: z.string().datetime().optional(),
});

export type CrmActivityInput = z.infer<typeof crmActivitySchema>;

export async function createActivity(
  tenantId: string,
  createdBy: string,
  data: CrmActivityInput
) {
  const parsed = crmActivitySchema.parse(data);
  return prisma.crmActivity.create({
    data: {
      tenantId,
      createdBy,
      ...parsed,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
    },
  });
}

export async function getActivity(id: string, tenantId: string) {
  return prisma.crmActivity.findFirst({
    where: { id, tenantId },
    include: { contact: true, deal: true },
  });
}

export async function listActivities(tenantId: string, contactId?: string) {
  return prisma.crmActivity.findMany({
    where: {
      tenantId,
      ...(contactId && { contactId }),
    },
    include: { contact: true, deal: true },
    orderBy: { dueDate: "asc" },
    take: 100,
  });
}

export async function completeActivity(id: string, tenantId: string) {
  return prisma.crmActivity.update({
    where: { id_tenantId: { id, tenantId } },
    data: { completed: new Date() },
  });
}

export async function getPendingTasks(tenantId: string) {
  return prisma.crmActivity.findMany({
    where: {
      tenantId,
      type: "TASK",
      completed: null,
      dueDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { dueDate: "asc" },
  });
}

export async function getActivitySummary(
  tenantId: string,
  days: number = 30
) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const activities = await prisma.crmActivity.findMany({
    where: { tenantId, createdAt: { gte: since } },
  });

  return {
    total: activities.length,
    byType: {
      CALL: activities.filter((a) => a.type === "CALL").length,
      EMAIL: activities.filter((a) => a.type === "EMAIL").length,
      MEETING: activities.filter((a) => a.type === "MEETING").length,
      TASK: activities.filter((a) => a.type === "TASK").length,
      NOTE: activities.filter((a) => a.type === "NOTE").length,
    },
  };
}
