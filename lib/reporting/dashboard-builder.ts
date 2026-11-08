import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const DashboardWidgetSchema = z.object({
  id: z.string(),
  type: z.enum([
    "metric",
    "chart",
    "table",
    "timeline",
    "gauge",
    "sparkline",
    "custom",
  ]),
  title: z.string().optional(),
  config: z.record(z.unknown()),
  query: z.record(z.unknown()).optional(),
});

export const DashboardLayoutSchema = z.object({
  columns: z.number().default(12),
  rows: z.array(
    z.object({
      height: z.number(),
      widgets: z.array(
        z.object({
          id: z.string(),
          colSpan: z.number(),
          rowSpan: z.number().default(1),
        })
      ),
    })
  ),
});

export const DashboardSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  layout: DashboardLayoutSchema,
  widgets: z.array(DashboardWidgetSchema),
  refreshIntervalSeconds: z.number().default(300),
  isPublic: z.boolean().default(false),
  viewers: z.array(z.string()).default([]),
  editors: z.array(z.string()).default([]),
});

export type Dashboard = z.infer<typeof DashboardSchema>;
export type DashboardWidget = z.infer<typeof DashboardWidgetSchema>;

// Create dashboard
export async function createDashboard(
  tenantId: string,
  userId: string,
  dashboard: Dashboard
) {
  const validated = DashboardSchema.parse(dashboard);

  try {
    const created = await prisma.dashboard.create({
      data: {
        tenantId,
        createdByUserId: userId,
        title: validated.title,
        description: validated.description,
        layout: validated.layout,
        widgets: validated.widgets,
        refreshIntervalSeconds: validated.refreshIntervalSeconds,
        isPublic: validated.isPublic,
        viewers: validated.viewers,
        editors: validated.editors,
      },
    });

    return created;
  } catch (err) {
    console.error("Failed to create dashboard:", err);
    throw err;
  }
}

// Get dashboard
export async function getDashboard(dashboardId: string) {
  try {
    const dashboard = await prisma.dashboard.findUnique({
      where: { id: dashboardId },
      include: {
        createdByUser: true,
        widgets: true,
      },
    });

    return dashboard;
  } catch (err) {
    console.error("Failed to get dashboard:", err);
    throw err;
  }
}

// Update dashboard
export async function updateDashboard(
  dashboardId: string,
  updates: Partial<Dashboard>
) {
  try {
    const dashboard = await prisma.dashboard.update({
      where: { id: dashboardId },
      data: {
        ...(updates.title && { title: updates.title }),
        ...(updates.description && { description: updates.description }),
        ...(updates.layout && { layout: updates.layout }),
        ...(updates.widgets && { widgets: updates.widgets }),
        ...(updates.refreshIntervalSeconds && {
          refreshIntervalSeconds: updates.refreshIntervalSeconds,
        }),
        ...(updates.isPublic !== undefined && { isPublic: updates.isPublic }),
        ...(updates.viewers && { viewers: updates.viewers }),
        ...(updates.editors && { editors: updates.editors }),
      },
    });

    return dashboard;
  } catch (err) {
    console.error("Failed to update dashboard:", err);
    throw err;
  }
}

// List dashboards for tenant
export async function listDashboards(
  tenantId: string,
  userId?: string,
  includeShared: boolean = true
) {
  try {
    const dashboards = await prisma.dashboard.findMany({
      where: {
        tenantId,
        ...(includeShared
          ? {}
          : {
              OR: [{ createdByUserId: userId }, { editors: { has: userId } }],
            }),
      },
      include: {
        createdByUser: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return dashboards;
  } catch (err) {
    console.error("Failed to list dashboards:", err);
    throw err;
  }
}

// Delete dashboard
export async function deleteDashboard(dashboardId: string) {
  try {
    await prisma.dashboard.delete({
      where: { id: dashboardId },
    });

    return { success: true };
  } catch (err) {
    console.error("Failed to delete dashboard:", err);
    throw err;
  }
}

// Add widget to dashboard
export async function addWidgetToDashboard(
  dashboardId: string,
  widget: DashboardWidget
) {
  try {
    const dashboard = await getDashboard(dashboardId);
    if (!dashboard) {
      throw new Error("Dashboard not found");
    }

    const widgets = [...(dashboard.widgets as any[]), widget];
    await updateDashboard(dashboardId, { widgets });

    return widget;
  } catch (err) {
    console.error("Failed to add widget:", err);
    throw err;
  }
}

// Remove widget from dashboard
export async function removeWidgetFromDashboard(
  dashboardId: string,
  widgetId: string
) {
  try {
    const dashboard = await getDashboard(dashboardId);
    if (!dashboard) {
      throw new Error("Dashboard not found");
    }

    const widgets = (dashboard.widgets as any[]).filter(
      (w) => w.id !== widgetId
    );
    await updateDashboard(dashboardId, { widgets });

    return { success: true };
  } catch (err) {
    console.error("Failed to remove widget:", err);
    throw err;
  }
}

// Share dashboard
export async function shareDashboard(
  dashboardId: string,
  userIds: string[],
  canEdit: boolean = false
) {
  try {
    const dashboard = await getDashboard(dashboardId);
    if (!dashboard) {
      throw new Error("Dashboard not found");
    }

    const editors = canEdit
      ? [...new Set([...(dashboard.editors || []), ...userIds])]
      : dashboard.editors || [];

    const viewers = [...new Set([...(dashboard.viewers || []), ...userIds])];

    await updateDashboard(dashboardId, { viewers, editors });

    return { success: true };
  } catch (err) {
    console.error("Failed to share dashboard:", err);
    throw err;
  }
}
