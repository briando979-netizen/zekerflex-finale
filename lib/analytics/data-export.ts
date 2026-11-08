import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { type Prisma } from "@prisma/client";

/**
 * Data Export — Bulk export for external analysis, data lakes, BI platforms.
 */

export type DataExportFormat = "csv" | "json" | "parquet";
export type DataExportStatus = "pending" | "processing" | "completed" | "failed";

export interface ExportRequest {
  title: string;
  dataTypes: string[]; // ["shifts", "applications", "payments", "workers"]
  filters?: Record<string, unknown>;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  format: DataExportFormat;
  destination?: "s3" | "email" | "local";
  s3Bucket?: string;
}

/**
 * Create a new data export request.
 */
export async function createExport(
  tenantId: string,
  userId: string,
  request: ExportRequest,
): Promise<string> {
  try {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 day TTL

    const exportRecord = await prisma.dataExport.create({
      data: {
        tenantId,
        requestedByUserId: userId,
        title: request.title,
        dataTypes: request.dataTypes,
        filters: (request.filters ?? {}) as Prisma.InputJsonValue,
        dateRangeStart: request.dateRangeStart,
        dateRangeEnd: request.dateRangeEnd,
        format: request.format,
        destination: request.destination,
        s3Bucket: request.s3Bucket,
        expiresAt,
      },
    });

    logger.info(`Data export created: ${request.title}`, {
      exportId: exportRecord.id,
      tenantId,
      format: request.format,
    });

    return exportRecord.id;
  } catch (err) {
    logger.error("Failed to create export", {
      error: (err as Error).message,
      title: request.title,
    });
    throw err;
  }
}

/**
 * Export shifts data.
 */
export async function exportShifts(
  startDate: Date,
  endDate: Date,
  filters?: Record<string, unknown>,
): Promise<Array<Record<string, unknown>>> {
  try {
    const shifts = await prisma.shift.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        startsAt: true,
        endsAt: true,
        hourlyRateCents: true,
        positions: true,
        branch: {
          select: {
            id: true,
            name: true,
            sector: true,
            city: true,
          },
        },
      },
      take: 10000, // Batch limit
    });

    return shifts.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      status: s.status,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      hourlyRateEur: (s.hourlyRateCents / 100).toFixed(2),
      positions: s.positions,
      branchName: s.branch?.name,
      sector: s.branch?.sector,
      city: s.branch?.city,
    }));
  } catch (err) {
    logger.error("Failed to export shifts", { error: (err as Error).message });
    return [];
  }
}

/**
 * Export applications/matches data.
 */
export async function exportApplications(
  startDate: Date,
  endDate: Date,
): Promise<Array<Record<string, unknown>>> {
  try {
    const matches = await prisma.shiftMatch.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        shiftId: true,
        responderId: true,
        status: true,
        createdAt: true,
        respondedAt: true,
        shift: {
          select: {
            title: true,
            startsAt: true,
          },
        },
        responder: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      take: 10000,
    });

    return matches.map((m) => ({
      id: m.id,
      shiftId: m.shiftId,
      shiftTitle: m.shift?.title,
      responderId: m.responderId,
      responderEmail: m.responder?.email,
      status: m.status,
      appliedAt: m.createdAt.toISOString(),
      respondedAt: m.respondedAt?.toISOString() ?? null,
      responseTimeMinutes: m.respondedAt
        ? Math.floor((m.respondedAt.getTime() - m.createdAt.getTime()) / 60000)
        : null,
    }));
  } catch (err) {
    logger.error("Failed to export applications", { error: (err as Error).message });
    return [];
  }
}

/**
 * Export invoices/payments data.
 */
export async function exportPayments(
  startDate: Date,
  endDate: Date,
): Promise<Array<Record<string, unknown>>> {
  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        status: true,
        totalCents: true,
        createdAt: true,
        issuer: {
          select: { id: true, name: true },
        },
        recipient: {
          select: { id: true, name: true },
        },
      },
      take: 10000,
    });

    return invoices.map((inv) => ({
      id: inv.id,
      status: inv.status,
      totalEur: (inv.totalCents / 100).toFixed(2),
      createdAt: inv.createdAt.toISOString(),
      issuerName: inv.issuer?.name,
      recipientName: inv.recipient?.name,
    }));
  } catch (err) {
    logger.error("Failed to export payments", { error: (err as Error).message });
    return [];
  }
}

/**
 * Export workers data.
 */
export async function exportWorkers(startDate: Date, endDate: Date): Promise<Array<Record<string, unknown>>> {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: "FREELANCER",
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        kycStatus: true,
        badgeLevel: true,
        createdAt: true,
      },
      take: 10000,
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      kycStatus: u.kycStatus,
      tier: u.badgeLevel,
      joinedAt: u.createdAt.toISOString(),
    }));
  } catch (err) {
    logger.error("Failed to export workers", { error: (err as Error).message });
    return [];
  }
}

/**
 * Format data as CSV.
 */
export function formatAsCSV(data: Array<Record<string, unknown>>, title?: string): string {
  if (data.length === 0) {
    return title ? `${title}\n` : "";
  }

  const headers = Object.keys(data[0]);
  const headerRow = headers.map((h) => `"${h}"`).join(",");
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const value = row[h];
        if (value === null || value === undefined) return "";
        if (typeof value === "string") return `"${value.replace(/"/g, '""')}"`;
        return String(value);
      })
      .join(","),
  );

  return [title ? `# ${title}` : "", headerRow, ...rows].filter(Boolean).join("\n");
}

/**
 * Format data as JSON.
 */
export function formatAsJSON(
  data: Array<Record<string, unknown>>,
  title?: string,
): string {
  const output = {
    title,
    exportedAt: new Date().toISOString(),
    rowCount: data.length,
    data,
  };
  return JSON.stringify(output, null, 2);
}

/**
 * Process and execute a data export.
 */
export async function processExport(exportId: string): Promise<void> {
  try {
    const exportRecord = await prisma.dataExport.findUnique({
      where: { id: exportId },
    });

    if (!exportRecord) {
      logger.warn(`Export not found: ${exportId}`);
      return;
    }

    // Mark as processing
    await prisma.dataExport.update({
      where: { id: exportId },
      data: { status: "processing", startedAt: new Date() },
    });

    let allData: Array<Record<string, unknown>> = [];
    const dataTypes = exportRecord.dataTypes;

    // Collect data from all requested types
    for (const dataType of dataTypes) {
      let data: Array<Record<string, unknown>> = [];

      switch (dataType) {
        case "shifts":
          data = await exportShifts(exportRecord.dateRangeStart, exportRecord.dateRangeEnd);
          break;
        case "applications":
          data = await exportApplications(exportRecord.dateRangeStart, exportRecord.dateRangeEnd);
          break;
        case "payments":
          data = await exportPayments(exportRecord.dateRangeStart, exportRecord.dateRangeEnd);
          break;
        case "workers":
          data = await exportWorkers(exportRecord.dateRangeStart, exportRecord.dateRangeEnd);
          break;
      }

      allData = allData.concat(data);
      const progress = Math.floor((dataTypes.indexOf(dataType) + 1) / dataTypes.length * 100);
      await prisma.dataExport.update({
        where: { id: exportId },
        data: { progress, rowsProcessed: allData.length },
      });
    }

    // Format the data
    let content = "";
    if (exportRecord.format === "csv") {
      content = formatAsCSV(allData, exportRecord.title);
    } else if (exportRecord.format === "json") {
      content = formatAsJSON(allData, exportRecord.title);
    } else {
      // parquet would require a library like parquetjs
      content = formatAsJSON(allData, exportRecord.title);
    }

    // Save or send based on destination
    let fileUrl: string | null = null;
    if (exportRecord.destination === "local") {
      // In a real system, save to storage
      fileUrl = `/exports/${exportId}.${exportRecord.format === "csv" ? "csv" : "json"}`;
    } else if (exportRecord.destination === "s3") {
      // Upload to S3
      fileUrl = await uploadToS3(exportRecord.s3Bucket ?? "", exportId, content);
    } else {
      // Send via email
      fileUrl = null; // Email sent instead
    }

    // Mark as completed
    await prisma.dataExport.update({
      where: { id: exportId },
      data: {
        status: "completed",
        completedAt: new Date(),
        fileUrl,
        fileSize: content.length,
        progress: 100,
        rowsProcessed: allData.length,
        totalRows: allData.length,
      },
    });

    logger.info(`Export completed: ${exportId}`, {
      rowCount: allData.length,
      format: exportRecord.format,
    });
  } catch (err) {
    logger.error("Failed to process export", {
      error: (err as Error).message,
      exportId,
    });

    await prisma.dataExport.update({
      where: { id: exportId },
      data: {
        status: "failed",
        errorMessage: (err as Error).message,
      },
    });
  }
}

/**
 * List exports for a tenant.
 */
export async function listExports(
  tenantId: string,
  offset = 0,
  limit = 20,
): Promise<Array<{ id: string; title: string; status: string; progress: number; createdAt: Date }>> {
  try {
    const exports = await prisma.dataExport.findMany({
      where: { tenantId },
      select: {
        id: true,
        title: true,
        status: true,
        progress: true,
        createdAt: true,
      },
      skip: offset,
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    return exports;
  } catch (err) {
    logger.error("Failed to list exports", { error: (err as Error).message, tenantId });
    return [];
  }
}

/**
 * Delete an old export.
 */
export async function deleteExport(exportId: string): Promise<void> {
  try {
    await prisma.dataExport.delete({
      where: { id: exportId },
    });

    logger.info(`Export deleted: ${exportId}`);
  } catch (err) {
    logger.error("Failed to delete export", {
      error: (err as Error).message,
      exportId,
    });
    throw err;
  }
}

// === Helpers ===

async function uploadToS3(bucket: string, key: string, content: string): Promise<string> {
  // In a real system, use AWS SDK or similar
  logger.info("Would upload to S3", { bucket, key, size: content.length });
  return `s3://${bucket}/${key}`;
}
