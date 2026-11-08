import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { type Prisma } from "@prisma/client";

/**
 * Visualization — Dashboards, widgets, charts, and drill-downs.
 */

export interface Widget {
  id: string;
  type: "line-chart" | "bar-chart" | "pie-chart" | "metric" | "table" | "map";
  title: string;
  query: Record<string, unknown>;
  config: Record<string, unknown>; // chart-specific config
}

export interface DashboardLayout {
  grid: Array<{
    widgetId: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }>;
}

export interface Dashboard {
  id: string;
  title: string;
  description: string | null;
  widgets: Widget[];
  layout: DashboardLayout;
  isPublic: boolean;
  viewers: string[];
  editors: string[];
}

/**
 * Create a new dashboard.
 */
export async function createDashboard(
  tenantId: string,
  userId: string,
  title: string,
  description?: string,
): Promise<string> {
  try {
    const dashboard = await prisma.dashboard.create({
      data: {
        tenantId,
        createdByUserId: userId,
        title,
        description,
        layout: {
          grid: [],
        } as Prisma.InputJsonValue,
        widgets: [] as Prisma.InputJsonValue,
      },
    });

    logger.info(`Dashboard created: ${title}`, { dashboardId: dashboard.id, tenantId });
    return dashboard.id;
  } catch (err) {
    logger.error("Failed to create dashboard", {
      error: (err as Error).message,
      title,
    });
    throw err;
  }
}

/**
 * Add a widget to a dashboard.
 */
export async function addWidget(
  dashboardId: string,
  widget: Widget,
  position: { x: number; y: number; w: number; h: number },
): Promise<void> {
  try {
    const dashboard = await prisma.dashboard.findUnique({
      where: { id: dashboardId },
    });

    if (!dashboard) {
      throw new Error("Dashboard not found");
    }

    const widgets = (dashboard.widgets as Widget[]) ?? [];
    widgets.push(widget);

    const layout = (dashboard.layout as DashboardLayout) ?? { grid: [] };
    layout.grid.push({
      widgetId: widget.id,
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
    });

    await prisma.dashboard.update({
      where: { id: dashboardId },
      data: {
        widgets: widgets as Prisma.InputJsonValue,
        layout: layout as Prisma.InputJsonValue,
      },
    });

    logger.info(`Widget added to dashboard: ${dashboardId}`, {
      widgetId: widget.id,
      type: widget.type,
    });
  } catch (err) {
    logger.error("Failed to add widget", {
      error: (err as Error).message,
      dashboardId,
    });
    throw err;
  }
}

/**
 * Remove a widget from a dashboard.
 */
export async function removeWidget(dashboardId: string, widgetId: string): Promise<void> {
  try {
    const dashboard = await prisma.dashboard.findUnique({
      where: { id: dashboardId },
    });

    if (!dashboard) {
      throw new Error("Dashboard not found");
    }

    const widgets = ((dashboard.widgets as Widget[]) ?? []).filter((w) => w.id !== widgetId);
    const layout = (dashboard.layout as DashboardLayout) ?? { grid: [] };
    layout.grid = layout.grid.filter((item) => item.widgetId !== widgetId);

    await prisma.dashboard.update({
      where: { id: dashboardId },
      data: {
        widgets: widgets as Prisma.InputJsonValue,
        layout: layout as Prisma.InputJsonValue,
      },
    });

    logger.info(`Widget removed from dashboard: ${dashboardId}`, { widgetId });
  } catch (err) {
    logger.error("Failed to remove widget", {
      error: (err as Error).message,
      dashboardId,
      widgetId,
    });
    throw err;
  }
}

/**
 * Update widget configuration.
 */
export async function updateWidget(
  dashboardId: string,
  widgetId: string,
  updates: Partial<Widget>,
): Promise<void> {
  try {
    const dashboard = await prisma.dashboard.findUnique({
      where: { id: dashboardId },
    });

    if (!dashboard) {
      throw new Error("Dashboard not found");
    }

    const widgets = ((dashboard.widgets as Widget[]) ?? []).map((w) =>
      w.id === widgetId ? { ...w, ...updates } : w,
    );

    await prisma.dashboard.update({
      where: { id: dashboardId },
      data: {
        widgets: widgets as Prisma.InputJsonValue,
      },
    });

    logger.info(`Widget updated: ${widgetId}`);
  } catch (err) {
    logger.error("Failed to update widget", {
      error: (err as Error).message,
      dashboardId,
      widgetId,
    });
    throw err;
  }
}

/**
 * Retrieve a complete dashboard.
 */
export async function getDashboard(dashboardId: string): Promise<Dashboard | null> {
  try {
    const dashboard = await prisma.dashboard.findUnique({
      where: { id: dashboardId },
    });

    if (!dashboard) {
      return null;
    }

    return {
      id: dashboard.id,
      title: dashboard.title,
      description: dashboard.description,
      widgets: (dashboard.widgets as Widget[]) ?? [],
      layout: (dashboard.layout as DashboardLayout) ?? { grid: [] },
      isPublic: dashboard.isPublic,
      viewers: dashboard.viewers,
      editors: dashboard.editors,
    };
  } catch (err) {
    logger.error("Failed to retrieve dashboard", {
      error: (err as Error).message,
      dashboardId,
    });
    return null;
  }
}

/**
 * List dashboards for a tenant.
 */
export async function listDashboards(
  tenantId: string,
  offset = 0,
  limit = 20,
): Promise<Array<{ id: string; title: string; isPublic: boolean }>> {
  try {
    const dashboards = await prisma.dashboard.findMany({
      where: { tenantId },
      select: {
        id: true,
        title: true,
        isPublic: true,
      },
      skip: offset,
      take: limit,
      orderBy: { updatedAt: "desc" },
    });

    return dashboards;
  } catch (err) {
    logger.error("Failed to list dashboards", { error: (err as Error).message, tenantId });
    return [];
  }
}

/**
 * Share a dashboard with other users.
 */
export async function shareDashboard(
  dashboardId: string,
  userIds: string[],
  permission: "view" | "edit" = "view",
): Promise<void> {
  try {
    const dashboard = await prisma.dashboard.findUnique({
      where: { id: dashboardId },
    });

    if (!dashboard) {
      throw new Error("Dashboard not found");
    }

    const viewers = dashboard.viewers.includes(...userIds)
      ? dashboard.viewers
      : [...dashboard.viewers, ...userIds];
    const editors =
      permission === "edit"
        ? dashboard.editors.includes(...userIds)
          ? dashboard.editors
          : [...dashboard.editors, ...userIds]
        : dashboard.editors;

    await prisma.dashboard.update({
      where: { id: dashboardId },
      data: {
        viewers,
        editors,
      },
    });

    logger.info(`Dashboard shared: ${dashboardId}`, {
      userCount: userIds.length,
      permission,
    });
  } catch (err) {
    logger.error("Failed to share dashboard", {
      error: (err as Error).message,
      dashboardId,
    });
    throw err;
  }
}

/**
 * Make a dashboard public or private.
 */
export async function setDashboardPublic(dashboardId: string, isPublic: boolean): Promise<void> {
  try {
    await prisma.dashboard.update({
      where: { id: dashboardId },
      data: { isPublic },
    });

    logger.info(`Dashboard visibility updated: ${dashboardId}`, { isPublic });
  } catch (err) {
    logger.error("Failed to update dashboard visibility", {
      error: (err as Error).message,
      dashboardId,
    });
    throw err;
  }
}

/**
 * Delete a dashboard.
 */
export async function deleteDashboard(dashboardId: string): Promise<void> {
  try {
    await prisma.dashboard.delete({
      where: { id: dashboardId },
    });

    logger.info(`Dashboard deleted: ${dashboardId}`);
  } catch (err) {
    logger.error("Failed to delete dashboard", {
      error: (err as Error).message,
      dashboardId,
    });
    throw err;
  }
}

/**
 * Build a metric widget (single number display).
 */
export function createMetricWidget(
  id: string,
  title: string,
  value: number,
  unit = "",
  trend?: "up" | "down",
): Widget {
  return {
    id,
    type: "metric",
    title,
    query: {},
    config: {
      value,
      unit,
      trend,
      decimals: 2,
      prefix: "",
      suffix: "",
    },
  };
}

/**
 * Build a chart widget (configurable chart type).
 */
export function createChartWidget(
  id: string,
  title: string,
  type: "line-chart" | "bar-chart" | "pie-chart",
  data: Array<Record<string, unknown>>,
  xAxis: string,
  yAxis: string,
): Widget {
  return {
    id,
    type,
    title,
    query: { data },
    config: {
      xAxis,
      yAxis,
      responsive: true,
      animationDuration: 300,
    },
  };
}

/**
 * Build a table widget.
 */
export function createTableWidget(
  id: string,
  title: string,
  columns: string[],
  data: Array<Record<string, unknown>>,
): Widget {
  return {
    id,
    type: "table",
    title,
    query: { data },
    config: {
      columns,
      sortable: true,
      filterable: true,
      pageSize: 20,
    },
  };
}
