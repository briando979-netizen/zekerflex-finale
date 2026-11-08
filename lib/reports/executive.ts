import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const ExecutiveReportSchema = z.object({
  period: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]),
  kpis: z.array(
    z.object({
      name: z.string(),
      value: z.number(),
      target: z.number(),
      trend: z.enum(["up", "down", "flat"]),
      trendPercent: z.number(),
      status: z.enum(["on-track", "at-risk", "off-track"]),
    })
  ),
  trends: z.array(
    z.object({
      metric: z.string(),
      data: z.array(z.object({ date: z.string(), value: z.number() })),
      forecast: z.array(z.object({ date: z.string(), value: z.number() })),
    })
  ),
  alerts: z.array(
    z.object({
      severity: z.enum(["critical", "warning", "info"]),
      message: z.string(),
      timestamp: z.string(),
    })
  ),
  goals: z.array(
    z.object({
      name: z.string(),
      progress: z.number(), // 0-100
      dueDate: z.string(),
      owner: z.string(),
    })
  ),
});

export type ExecutiveReport = z.infer<typeof ExecutiveReportSchema>;

export async function generateExecutiveReport(
  tenantId: string,
  period: "daily" | "weekly" | "monthly" | "quarterly" | "yearly"
): Promise<ExecutiveReport> {
  const kpis = [
    {
      name: "Revenue",
      value: 245000,
      target: 250000,
      trend: "up" as const,
      trendPercent: 2.5,
      status: "on-track" as const,
    },
    {
      name: "New Users",
      value: 1250,
      target: 1000,
      trend: "up" as const,
      trendPercent: 25,
      status: "on-track" as const,
    },
    {
      name: "Churn Rate",
      value: 2.1,
      target: 1.5,
      trend: "up" as const,
      trendPercent: 40,
      status: "at-risk" as const,
    },
    {
      name: "Customer Satisfaction",
      value: 4.5,
      target: 4.7,
      trend: "down" as const,
      trendPercent: -4.3,
      status: "at-risk" as const,
    },
  ];

  const trends = [
    {
      metric: "Daily Revenue",
      data: Array.from({ length: 30 }, (_, i) => ({
        date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split("T")[0],
        value: Math.random() * 10000 + 8000,
      })),
      forecast: Array.from({ length: 7 }, (_, i) => ({
        date: new Date(Date.now() + (i + 1) * 86400000).toISOString().split("T")[0],
        value: Math.random() * 10000 + 8000,
      })),
    },
  ];

  const alerts = [
    {
      severity: "warning" as const,
      message: "Churn rate increased 40% this period",
      timestamp: new Date().toISOString(),
    },
    {
      severity: "info" as const,
      message: "New user acquisition 25% above target",
      timestamp: new Date().toISOString(),
    },
  ];

  const goals = [
    {
      name: "Increase revenue to $300k",
      progress: 82,
      dueDate: new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0],
      owner: "Sales Team",
    },
    {
      name: "Reduce churn below 1.5%",
      progress: 45,
      dueDate: new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0],
      owner: "Support Team",
    },
  ];

  return ExecutiveReportSchema.parse({
    period,
    kpis,
    trends,
    alerts,
    goals,
  });
}

export async function saveExecutiveReport(
  tenantId: string,
  report: ExecutiveReport
): Promise<void> {
  await prisma.executiveReport.create({
    data: {
      tenantId,
      period: report.period,
      content: JSON.stringify(report),
      generatedAt: new Date(),
    },
  });
}
