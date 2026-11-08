import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const integrationSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  category: z.enum(["crm", "email", "payment", "communication", "analytics", "other"]),
  icon: z.string().url(),
  documentation: z.string().url(),
  requiresAuth: z.boolean().default(true),
  ratingCount: z.number().int().default(0),
  averageRating: z.number().min(0).max(5).default(0),
});

export type Integration = z.infer<typeof integrationSchema>;

export async function getAvailableIntegrations() {
  const integrations = await prisma.integration.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      icon: true,
      ratingCount: true,
      averageRating: true,
    },
    orderBy: { averageRating: "desc" },
  });
  return integrations;
}

export async function getIntegrationById(id: string) {
  return prisma.integration.findUnique({ where: { id } });
}

export async function installIntegration(userId: string, integrationId: string, config: Record<string, unknown>) {
  return prisma.userIntegration.create({
    data: { userId, integrationId, configuration: config as any, status: "ACTIVE" },
  });
}

export async function uninstallIntegration(userId: string, integrationId: string) {
  return prisma.userIntegration.updateMany({
    where: { userId, integrationId },
    data: { status: "INACTIVE", uninstalledAt: new Date() },
  });
}

export async function getUserIntegrations(userId: string) {
  return prisma.userIntegration.findMany({
    where: { userId, status: "ACTIVE" },
    include: { integration: true },
  });
}

export async function checkIntegrationHealth(integrationId: string) {
  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  if (!integration) throw new Error("Integration not found");

  const lastCheck = new Date(Date.now() - 5 * 60 * 1000);
  const recentErrors = await prisma.integrationError.count({
    where: { integrationId, createdAt: { gte: lastCheck } },
  });

  return { healthy: recentErrors < 5, errorCount: recentErrors, lastCheck };
}
