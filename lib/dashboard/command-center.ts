import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const commandCenterSchema = z.object({
  userId: z.string(),
  title: z.string(),
  widgets: z.array(z.object({
    id: z.string(),
    type: z.enum(["kpi", "chart", "alert", "map", "action", "status"]),
    config: z.record(z.any()),
    position: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
  })),
  alerts: z.array(z.object({
    id: z.string(),
    type: z.enum(["critical", "warning", "info"]),
    message: z.string(),
    timestamp: z.date(),
    action: z.string().optional()
  })),
  incidents: z.array(z.object({
    id: z.string(),
    title: z.string(),
    status: z.enum(["open", "investigating", "resolved"]),
    severity: z.enum(["critical", "high", "medium", "low"]),
    createdAt: z.date(),
    resolvedAt: z.date().optional()
  })),
  realTimeMetrics: z.record(z.number())
});

export async function getCommandCenter(userId: string) {
  return await prisma.dashboard.findFirst({
    where: { userId, type: "command_center" }
  });
}

export async function createCommandCenter(userId: string, data: z.infer<typeof commandCenterSchema>) {
  const validated = commandCenterSchema.parse(data);
  return await prisma.dashboard.create({
    data: {
      userId,
      type: "command_center",
      title: validated.title,
      config: validated as any
    }
  });
}

export async function updateCommandCenter(dashboardId: string, data: Partial<z.infer<typeof commandCenterSchema>>) {
  return await prisma.dashboard.update({
    where: { id: dashboardId },
    data: { config: data }
  });
}

export async function getAlerts(userId: string, severity?: string) {
  const dashboard = await getCommandCenter(userId);
  if (!dashboard) return [];
  const config = dashboard.config as any;
  return severity ? config.alerts?.filter((a: any) => a.type === severity) : config.alerts;
}

export async function getIncidents(userId: string) {
  const dashboard = await getCommandCenter(userId);
  if (!dashboard) return [];
  const config = dashboard.config as any;
  return config.incidents?.filter((i: any) => i.status !== "resolved") || [];
}
