import { z } from "zod";

export const roleDashboardConfig = {
  executive: {
    name: "Executive Dashboard",
    widgets: ["revenue", "kpi_summary", "forecasts", "alerts", "team_health"],
    defaultCharts: ["revenue_trend", "margin_analysis", "growth_projection"],
    refreshInterval: 300000
  },
  operational: {
    name: "Operations Dashboard",
    widgets: ["real_time_metrics", "queue_depth", "alerts", "incidents", "performance"],
    defaultCharts: ["throughput", "error_rate", "latency_p95", "resource_utilization"],
    refreshInterval: 30000
  },
  team: {
    name: "Team Dashboard",
    widgets: ["my_tasks", "team_progress", "goals", "activity_feed", "collaboration"],
    defaultCharts: ["task_completion", "velocity", "team_utilization"],
    refreshInterval: 60000
  },
  manager: {
    name: "Manager Dashboard",
    widgets: ["team_metrics", "projects", "resource_allocation", "performance", "alerts"],
    defaultCharts: ["team_productivity", "project_status", "budget_usage"],
    refreshInterval: 120000
  }
};

export async function getRoleDashboard(role: string) {
  return roleDashboardConfig[role as keyof typeof roleDashboardConfig] || null;
}

export const dashboardWidgetSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  config: z.record(z.any()),
  refreshInterval: z.number().optional(),
  permissions: z.array(z.string()).optional()
});

export async function validateWidgetsForRole(role: string, widgets: string[]) {
  const config = getRoleDashboard(role);
  if (!config) return false;
  return widgets.every(w => config.widgets.includes(w));
}
