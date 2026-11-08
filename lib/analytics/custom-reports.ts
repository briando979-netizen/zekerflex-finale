import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { type Prisma } from "@prisma/client";

/**
 * Custom Reports — Build, schedule, and export user-defined analytics queries.
 */

export interface ReportQuery {
  from: string; // "shifts" | "applications" | "payments" | "workers"
  select: string[]; // ["id", "title", "status", "hourlyRate"]
  where?: Record<string, unknown>; // filters
  groupBy?: string[]; // dimensions to group by
  orderBy?: Record<string, "asc" | "desc">; // sorting
  limit?: number;
}

export interface ReportDefinition {
  title: string;
  description?: string;
  query: ReportQuery;
  formats: string[]; // ["json", "pdf", "csv", "xlsx"]
  isScheduled: boolean;
  scheduleFreq?: "daily" | "weekly" | "monthly";
  recipients: string[]; // email addresses
  isPublic: boolean;
  sharedWith: string[]; // user IDs
}

export interface ReportResult {
  id: string;
  title: string;
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  generatedAt: string;
}

/**
 * Create or update a custom report definition.
 */
export async function createOrUpdateReport(
  tenantId: string,
  userId: string,
  report: ReportDefinition,
  reportId?: string,
): Promise<string> {
  try {
    const result = await prisma.customReport.upsert({
      where: reportId ? { id: reportId } : { id: "" },
      update: {
        title: report.title,
        description: report.description,
        query: report.query as Prisma.InputJsonValue,
        formats: report.formats,
        isScheduled: report.isScheduled,
        scheduleFreq: report.scheduleFreq,
        recipients: report.recipients,
        isPublic: report.isPublic,
        sharedWith: report.sharedWith,
      },
      create: {
        tenantId,
        createdByUserId: userId,
        title: report.title,
        description: report.description,
        query: report.query as Prisma.InputJsonValue,
        formats: report.formats,
        isScheduled: report.isScheduled,
        scheduleFreq: report.scheduleFreq,
        recipients: report.recipients,
        isPublic: report.isPublic,
        sharedWith: report.sharedWith,
      },
    });

    logger.info(`Report ${reportId ? "updated" : "created"}: ${report.title}`, {
      reportId: result.id,
      tenantId,
    });
    return result.id;
  } catch (err) {
    logger.error("Failed to create/update report", {
      error: (err as Error).message,
      title: report.title,
    });
    throw err;
  }
}

/**
 * Execute a report query and return results.
 * This is a simplified implementation; a real system would handle complex queries.
 */
export async function executeReport(query: ReportQuery): Promise<ReportResult> {
  const rows: unknown[][] = [];

  try {
    switch (query.from) {
      case "shifts": {
        const shifts = await prisma.shift.findMany({
          select: buildSelectClause(query.select),
          take: query.limit ?? 1000,
        });
        rows.push(...shifts.map((s) => Object.values(s)));
        break;
      }

      case "applications": {
        const matches = await prisma.shiftMatch.findMany({
          select: buildSelectClause(query.select),
          take: query.limit ?? 1000,
        });
        rows.push(...matches.map((m) => Object.values(m)));
        break;
      }

      case "payments": {
        const invoices = await prisma.invoice.findMany({
          select: buildSelectClause(query.select),
          take: query.limit ?? 1000,
        });
        rows.push(...invoices.map((inv) => Object.values(inv)));
        break;
      }

      case "workers": {
        const users = await prisma.user.findMany({
          where: { role: "FREELANCER" },
          select: buildSelectClause(query.select),
          take: query.limit ?? 1000,
        });
        rows.push(...users.map((u) => Object.values(u)));
        break;
      }

      default:
        logger.warn(`Unknown report source: ${query.from}`);
    }
  } catch (err) {
    logger.error("Failed to execute report", { error: (err as Error).message });
    throw err;
  }

  return {
    id: `report-${Date.now()}`,
    title: "Report",
    columns: query.select,
    rows,
    rowCount: rows.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Schedule a report for periodic generation and distribution.
 */
export async function scheduleReport(
  reportId: string,
  frequency: "daily" | "weekly" | "monthly",
  recipients: string[],
): Promise<void> {
  const nextRun = calculateNextRun(frequency);

  try {
    await prisma.customReport.update({
      where: { id: reportId },
      data: {
        isScheduled: true,
        scheduleFreq: frequency,
        recipients,
        nextRunAt: nextRun,
      },
    });
    logger.info(`Report scheduled: ${reportId} for ${frequency} execution`);
  } catch (err) {
    logger.error("Failed to schedule report", { error: (err as Error).message, reportId });
    throw err;
  }
}

/**
 * Unschedule a report.
 */
export async function unscheduleReport(reportId: string): Promise<void> {
  try {
    await prisma.customReport.update({
      where: { id: reportId },
      data: {
        isScheduled: false,
        nextRunAt: null,
      },
    });
    logger.info(`Report unscheduled: ${reportId}`);
  } catch (err) {
    logger.error("Failed to unschedule report", { error: (err as Error).message, reportId });
    throw err;
  }
}

/**
 * Execute all scheduled reports that are due.
 */
export async function executeScheduledReports(): Promise<void> {
  const dueReports = await prisma.customReport.findMany({
    where: {
      isScheduled: true,
      nextRunAt: { lte: new Date() },
    },
  });

  for (const report of dueReports) {
    try {
      const query = report.query as ReportQuery;
      const result = await executeReport(query);

      // Update report's last run time
      const nextRun = calculateNextRun(report.scheduleFreq as string);
      await prisma.customReport.update({
        where: { id: report.id },
        data: {
          lastRunAt: new Date(),
          nextRunAt: nextRun,
        },
      });

      // In a real system, export to requested formats and send to recipients
      logger.info(`Report executed: ${report.id} (${result.rowCount} rows)`, {
        recipients: report.recipients,
      });
    } catch (err) {
      logger.error("Failed to execute scheduled report", {
        error: (err as Error).message,
        reportId: report.id,
      });
    }
  }
}

/**
 * Share a report with other users.
 */
export async function shareReport(
  reportId: string,
  userIds: string[],
  isPublic = false,
): Promise<void> {
  try {
    await prisma.customReport.update({
      where: { id: reportId },
      data: {
        isPublic,
        sharedWith: { push: userIds },
      },
    });
    logger.info(`Report shared: ${reportId}`, { userCount: userIds.length, isPublic });
  } catch (err) {
    logger.error("Failed to share report", { error: (err as Error).message, reportId });
    throw err;
  }
}

/**
 * Export report results to various formats.
 */
export async function exportReport(
  result: ReportResult,
  format: "json" | "csv" | "pdf" | "xlsx",
): Promise<string> {
  let output = "";

  switch (format) {
    case "json":
      output = JSON.stringify(result, null, 2);
      break;

    case "csv": {
      const headers = result.columns.join(",");
      const rows = result.rows.map((row) => row.map((v) => `"${v}"`).join(","));
      output = [headers, ...rows].join("\n");
      break;
    }

    case "pdf":
      // In a real system, use a library like pdfkit or puppeteer
      output = `PDF Export: ${result.title}\n\n${JSON.stringify(result, null, 2)}`;
      break;

    case "xlsx":
      // In a real system, use a library like xlsx
      output = `XLSX Export: ${result.title}\n\n${JSON.stringify(result, null, 2)}`;
      break;

    default:
      logger.warn(`Unknown export format: ${format}`);
  }

  return output;
}

/**
 * List reports for a tenant (with pagination).
 */
export async function listReports(
  tenantId: string,
  offset = 0,
  limit = 20,
): Promise<Array<{ id: string; title: string; description: string | null; isScheduled: boolean }>> {
  const reports = await prisma.customReport.findMany({
    where: { tenantId },
    select: {
      id: true,
      title: true,
      description: true,
      isScheduled: true,
    },
    skip: offset,
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  return reports;
}

/**
 * Delete a custom report.
 */
export async function deleteReport(reportId: string): Promise<void> {
  try {
    await prisma.customReport.delete({
      where: { id: reportId },
    });
    logger.info(`Report deleted: ${reportId}`);
  } catch (err) {
    logger.error("Failed to delete report", { error: (err as Error).message, reportId });
    throw err;
  }
}

// === Helpers ===

function buildSelectClause(fields: string[]): Record<string, boolean> {
  const select: Record<string, boolean> = {};
  for (const field of fields) {
    select[field] = true;
  }
  return select;
}

function calculateNextRun(frequency: string): Date {
  const now = new Date();

  switch (frequency) {
    case "daily":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case "weekly":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "monthly":
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}
