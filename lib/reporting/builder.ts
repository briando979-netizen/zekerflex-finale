import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const ReportConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  metrics: z.array(z.string()),
  dateRange: z.object({ start: z.date(), end: z.date() }),
  filters: z.record(z.any()).optional(),
  charts: z.array(z.object({
    type: z.enum(["line", "bar", "pie", "table"]),
    metric: z.string(),
  })),
  scheduled: z.boolean().optional(),
  scheduleFrequency: z.enum(["daily", "weekly", "monthly"]).optional(),
  emailRecipients: z.array(z.string().email()).optional(),
});

export type ReportConfig = z.infer<typeof ReportConfigSchema>;

export class ReportBuilder {
  async createReport(config: ReportConfig, tenantId: string) {
    const validated = ReportConfigSchema.parse(config);

    const report = await prisma.report.create({
      data: {
        name: validated.name,
        description: validated.description,
        config: JSON.stringify(validated),
        tenantId,
        status: "DRAFT",
      },
    });

    return report;
  }

  async generateReport(reportId: string) {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) throw new Error("Report not found");

    const config = JSON.parse(report.config) as ReportConfig;

    const data = await this.fetchMetricData(config);

    const reportVersion = await prisma.reportVersion.create({
      data: {
        reportId,
        data: JSON.stringify(data),
        generatedAt: new Date(),
      },
    });

    return reportVersion;
  }

  private async fetchMetricData(config: ReportConfig) {
    const data: Record<string, unknown> = {};

    for (const metric of config.metrics) {
      if (metric === "revenue") {
        const invoices = await prisma.invoice.findMany({
          where: {
            createdAt: {
              gte: config.dateRange.start,
              lte: config.dateRange.end,
            },
          },
        });
        data[metric] = invoices.reduce((sum, inv) => sum + (inv.amountCents ?? 0), 0) / 100;
      } else if (metric === "user_count") {
        data[metric] = await prisma.user.count({
          where: {
            createdAt: {
              gte: config.dateRange.start,
              lte: config.dateRange.end,
            },
          },
        });
      } else if (metric === "shifts_completed") {
        data[metric] = await prisma.freelancerShift.count({
          where: {
            status: "COMPLETED",
            completedAt: {
              gte: config.dateRange.start,
              lte: config.dateRange.end,
            },
          },
        });
      }
    }

    return data;
  }

  async scheduleReport(reportId: string, frequency: "daily" | "weekly" | "monthly", recipients: string[]) {
    const report = await prisma.report.update({
      where: { id: reportId },
      data: {
        scheduled: true,
        scheduleFrequency: frequency,
        emailRecipients: recipients,
      },
    });

    return report;
  }

  async exportReport(reportVersionId: string, format: "pdf" | "csv" | "excel") {
    const version = await prisma.reportVersion.findUnique({
      where: { id: reportVersionId },
    });

    if (!version) throw new Error("Report version not found");

    const data = JSON.parse(version.data);

    if (format === "csv") {
      return this.exportAsCSV(data);
    } else if (format === "excel") {
      return this.exportAsExcel(data);
    } else if (format === "pdf") {
      return this.exportAsPDF(data);
    }

    return null;
  }

  private exportAsCSV(data: Record<string, unknown>): string {
    const rows = [["Metric", "Value"]];
    for (const [key, value] of Object.entries(data)) {
      rows.push([key, String(value)]);
    }
    return rows.map((row) => row.join(",")).join("\n");
  }

  private exportAsExcel(data: Record<string, unknown>): Buffer {
    // Simplified: actual Excel generation would use a library like xlsx
    const csv = this.exportAsCSV(data);
    return Buffer.from(csv, "utf-8");
  }

  private exportAsPDF(data: Record<string, unknown>): Buffer {
    // Simplified: actual PDF generation would use a library like pdfkit
    const content = Object.entries(data)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
    return Buffer.from(content, "utf-8");
  }
}
