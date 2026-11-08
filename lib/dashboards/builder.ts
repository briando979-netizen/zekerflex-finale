import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const DashboardWidgetSchema = z.object({
  id: z.string(),
  type: z.enum([
    "kpi",
    "chart",
    "table",
    "map",
    "gauge",
    "sparkline",
    "heatmap",
  ]),
  title: z.string(),
  config: z.record(z.unknown()),
  position: z.object({ x: z.number(), y: z.number() }),
  size: z.object({ width: z.number(), height: z.number() }),
  dataSource: z.string(),
  refreshInterval: z.number().optional(),
  drillDownPath: z.string().optional(),
});

export const DashboardSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  role: z.string(),
  isPublic: z.boolean().default(false),
  widgets: z.array(DashboardWidgetSchema),
  layout: z.object({ columns: z.number(), rowHeight: z.number() }).optional(),
});

export type Dashboard = z.infer<typeof DashboardSchema>;

export async function createDashboard(
  tenantId: string,
  data: Dashboard
): Promise<Dashboard & { id: string }> {
  const dashboard = await prisma.dashboard.create({
    data: {
      ...data,
      tenantId,
      widgets: JSON.stringify(data.widgets),
      layout: data.layout ? JSON.stringify(data.layout) : null,
    },
  });

  return {
    id: dashboard.id,
    ...data,
  };
}

export async function updateDashboard(
  id: string,
  data: Partial<Dashboard>
): Promise<Dashboard & { id: string }> {
  const dashboard = await prisma.dashboard.update({
    where: { id },
    data: {
      ...data,
      widgets: data.widgets ? JSON.stringify(data.widgets) : undefined,
      layout: data.layout ? JSON.stringify(data.layout) : undefined,
    },
  });

  return {
    id: dashboard.id,
    name: dashboard.name,
    description: dashboard.description ?? undefined,
    role: dashboard.role,
    isPublic: dashboard.isPublic,
    widgets: JSON.parse(dashboard.widgets as string),
    layout: dashboard.layout ? JSON.parse(dashboard.layout) : undefined,
  };
}

export async function getDashboard(id: string): Promise<Dashboard & { id: string }> {
  const dashboard = await prisma.dashboard.findUniqueOrThrow({
    where: { id },
  });

  return {
    id: dashboard.id,
    name: dashboard.name,
    description: dashboard.description ?? undefined,
    role: dashboard.role,
    isPublic: dashboard.isPublic,
    widgets: JSON.parse(dashboard.widgets as string),
    layout: dashboard.layout ? JSON.parse(dashboard.layout) : undefined,
  };
}

export async function shareDashboard(
  dashboardId: string,
  role: string
): Promise<void> {
  await prisma.dashboardShare.create({
    data: { dashboardId, role },
  });
}

export async function getWidgetData(
  widgetId: string,
  dataSource: string
): Promise<unknown> {
  const [module, resource] = dataSource.split(":");
  if (module === "metrics") {
    return { value: Math.random() * 100, trend: Math.random() > 0.5 ? "up" : "down" };
  }
  return null;
}
