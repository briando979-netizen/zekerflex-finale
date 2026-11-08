import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Report template schema
export const ReportTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(["sales", "personnel", "financial", "operational", "custom"]),
  widgets: z.array(
    z.object({
      id: z.string(),
      type: z.enum([
        "metric",
        "chart",
        "table",
        "timeline",
        "gauge",
        "sparkline",
      ]),
      config: z.record(z.unknown()),
    })
  ),
  layout: z.object({
    columns: z.number().default(12),
    rows: z.array(
      z.object({
        height: z.number(),
        widgets: z.array(
          z.object({
            id: z.string(),
            colSpan: z.number(),
          })
        ),
      })
    ),
  }),
});

export type ReportTemplate = z.infer<typeof ReportTemplateSchema>;

// Predefined templates
export const REPORT_TEMPLATES: Record<string, ReportTemplate> = {
  sales_summary: {
    name: "Sales Summary",
    description: "Monthly sales overview with KPIs and trends",
    type: "sales",
    widgets: [
      {
        id: "total_revenue",
        type: "metric",
        config: {
          metric: "sum_revenue",
          label: "Total Revenue",
          format: "currency",
        },
      },
      {
        id: "order_count",
        type: "metric",
        config: {
          metric: "count_orders",
          label: "Order Count",
          format: "number",
        },
      },
      {
        id: "revenue_trend",
        type: "chart",
        config: {
          type: "line",
          metrics: ["sum_revenue"],
          dimensions: ["date"],
        },
      },
      {
        id: "top_products",
        type: "table",
        config: {
          metrics: ["sum_revenue", "count_orders"],
          dimensions: ["product"],
          limit: 10,
        },
      },
    ],
    layout: {
      columns: 12,
      rows: [
        {
          height: 2,
          widgets: [
            { id: "total_revenue", colSpan: 3 },
            { id: "order_count", colSpan: 3 },
          ],
        },
        {
          height: 4,
          widgets: [{ id: "revenue_trend", colSpan: 12 }],
        },
        {
          height: 4,
          widgets: [{ id: "top_products", colSpan: 12 }],
        },
      ],
    },
  },

  personnel: {
    name: "Personnel Report",
    description: "Worker activity and performance metrics",
    type: "personnel",
    widgets: [
      {
        id: "active_workers",
        type: "metric",
        config: {
          metric: "count_active_workers",
          label: "Active Workers",
        },
      },
      {
        id: "worker_hours",
        type: "metric",
        config: {
          metric: "sum_hours",
          label: "Total Hours",
          format: "decimal",
        },
      },
      {
        id: "hours_by_day",
        type: "chart",
        config: {
          type: "bar",
          metrics: ["sum_hours"],
          dimensions: ["date"],
        },
      },
    ],
    layout: {
      columns: 12,
      rows: [
        {
          height: 2,
          widgets: [
            { id: "active_workers", colSpan: 3 },
            { id: "worker_hours", colSpan: 3 },
          ],
        },
        {
          height: 4,
          widgets: [{ id: "hours_by_day", colSpan: 12 }],
        },
      ],
    },
  },
};

// Report designer service
export async function createReportFromTemplate(
  tenantId: string,
  userId: string,
  templateKey: string,
  customName?: string
) {
  const template = REPORT_TEMPLATES[templateKey];
  if (!template) {
    throw new Error(`Template not found: ${templateKey}`);
  }

  try {
    const report = await prisma.customReport.create({
      data: {
        tenantId,
        createdByUserId: userId,
        title: customName || template.name,
        description: template.description,
        query: {
          widgets: template.widgets,
          layout: template.layout,
          type: template.type,
        },
        formats: ["pdf", "xlsx"],
      },
    });
    return report;
  } catch (err) {
    console.error("Failed to create report from template:", err);
    throw err;
  }
}

// Get available templates
export function getAvailableTemplates() {
  return Object.entries(REPORT_TEMPLATES).map(([key, template]) => ({
    key,
    ...template,
  }));
}

// Validate report query
export async function validateReportQuery(query: unknown) {
  try {
    const validated = ReportTemplateSchema.pick({ widgets: true }).parse({
      widgets: (query as any)?.widgets || [],
    });
    return { valid: true, errors: [] };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { valid: false, errors: err.errors };
    }
    return { valid: false, errors: [{ message: String(err) }] };
  }
}
