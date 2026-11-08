import { z } from "zod";

export const widgetTypes = [
  "kpi_card", "line_chart", "bar_chart", "pie_chart", "heatmap", "map",
  "alert_list", "action_button", "status_indicator", "gauge", "sparkline",
  "table", "calendar", "timeline", "form", "text", "metric_comparison"
] as const;

export const widgetSchema = z.object({
  id: z.string().cuid(),
  type: z.enum(widgetTypes),
  title: z.string(),
  description: z.string().optional(),
  config: z.record(z.any()),
  dataSource: z.object({
    endpoint: z.string(),
    refreshInterval: z.number(),
    params: z.record(z.any()).optional()
  }),
  styling: z.object({
    width: z.number(),
    height: z.number(),
    position: z.object({ x: z.number(), y: z.number() }),
    colors: z.array(z.string()).optional(),
    theme: z.enum(["light", "dark"]).optional()
  }),
  permissions: z.array(z.string()).optional(),
  alerts: z.array(z.object({
    condition: z.string(),
    threshold: z.number(),
    severity: z.enum(["critical", "warning", "info"])
  })).optional()
});

export const prebuiltWidgets = {
  revenue_kpi: {
    type: "kpi_card",
    title: "Total Revenue",
    dataSource: { endpoint: "/api/metrics/revenue" }
  },
  user_growth: {
    type: "line_chart",
    title: "User Growth",
    dataSource: { endpoint: "/api/metrics/users" }
  },
  error_rate: {
    type: "gauge",
    title: "Error Rate",
    dataSource: { endpoint: "/api/metrics/errors" }
  },
  team_utilization: {
    type: "heatmap",
    title: "Team Utilization",
    dataSource: { endpoint: "/api/metrics/team-util" }
  },
  geographic_data: {
    type: "map",
    title: "Geographic Distribution",
    dataSource: { endpoint: "/api/metrics/geo" }
  },
  active_incidents: {
    type: "alert_list",
    title: "Active Incidents",
    dataSource: { endpoint: "/api/incidents/active" }
  }
};

export async function getWidgetLibrary() {
  return Object.entries(prebuiltWidgets).map(([key, value]) => ({
    id: key,
    ...value
  }));
}

export async function createCustomWidget(data: z.infer<typeof widgetSchema>) {
  return widgetSchema.parse(data);
}
