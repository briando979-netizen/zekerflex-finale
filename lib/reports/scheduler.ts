import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const ScheduledReportSchema = z.object({
  name: z.string(),
  reportType: z.enum(["executive", "detailed", "custom"]),
  format: z.enum(["pdf", "email", "slack"]),
  schedule: z.enum(["daily", "weekly", "monthly", "quarterly"]),
  recipients: z.array(z.string().email()),
  slackChannel: z.string().optional(),
  includeCharts: z.boolean().default(true),
  includeComments: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export type ScheduledReport = z.infer<typeof ScheduledReportSchema>;

export async function createScheduledReport(
  tenantId: string,
  data: ScheduledReport
): Promise<ScheduledReport & { id: string }> {
  const report = await prisma.scheduledReport.create({
    data: {
      tenantId,
      ...data,
      recipients: JSON.stringify(data.recipients),
    },
  });

  return {
    id: report.id,
    ...data,
  };
}

export async function getScheduledReports(tenantId: string): Promise<(ScheduledReport & { id: string })[]> {
  const reports = await prisma.scheduledReport.findMany({
    where: { tenantId },
  });

  return reports.map((r) => ({
    id: r.id,
    name: r.name,
    reportType: r.reportType as "executive" | "detailed" | "custom",
    format: r.format as "pdf" | "email" | "slack",
    schedule: r.schedule as "daily" | "weekly" | "monthly" | "quarterly",
    recipients: JSON.parse(r.recipients),
    slackChannel: r.slackChannel ?? undefined,
    includeCharts: r.includeCharts,
    includeComments: r.includeComments,
    isActive: r.isActive,
  }));
}

export async function generateAndDistribute(reportId: string): Promise<void> {
  const report = await prisma.scheduledReport.findUniqueOrThrow({
    where: { id: reportId },
  });

  const recipients = JSON.parse(report.recipients);

  if (report.format === "email") {
    await distributeViaEmail(report.name, recipients);
  } else if (report.format === "slack") {
    await distributeViaSlack(report.name, report.slackChannel || "");
  }
}

async function distributeViaEmail(reportName: string, recipients: string[]): Promise<void> {
  // Integration with email service
  console.log(`Distributing ${reportName} to ${recipients.join(", ")}`);
}

async function distributeViaSlack(reportName: string, channel: string): Promise<void> {
  // Integration with Slack API
  console.log(`Distributing ${reportName} to Slack channel ${channel}`);
}

export async function getReportHistory(reportId: string): Promise<Array<{ sentAt: Date; status: string }>> {
  return prisma.reportDelivery.findMany({
    where: { reportId },
    orderBy: { sentAt: "desc" },
    take: 20,
  });
}

export async function logDelivery(
  reportId: string,
  status: "success" | "failed",
  error?: string
): Promise<void> {
  await prisma.reportDelivery.create({
    data: {
      reportId,
      status,
      error: error || null,
      sentAt: new Date(),
    },
  });
}
