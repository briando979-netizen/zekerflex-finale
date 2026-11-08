import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { type Prisma } from "@prisma/client";

/**
 * Data Warehouse — Daily snapshot aggregation for shifts, applications, payments.
 * Aggregates key metrics by dimension (sector, city, worker tier, status).
 */

export interface SnapshotMetrics {
  totalCount: number;
  activeCount: number;
  averageValue?: number;
  totalValue?: number;
  breakdown: Record<string, Record<string, number | null>>;
}

export type DataType = "shifts" | "applications" | "payments" | "workers" | "employers";

/**
 * Aggregate shift data for a given date.
 */
export async function aggregateShifts(snapshotDate: string): Promise<SnapshotMetrics> {
  const [startDate, endDate] = getDateBounds(snapshotDate);

  // Count total shifts created/updated on this date
  const totalShifts = await prisma.shift.count({
    where: {
      createdAt: { gte: startDate, lt: endDate },
    },
  });

  // Count active/published shifts
  const activeShifts = await prisma.shift.count({
    where: {
      createdAt: { gte: startDate, lt: endDate },
      status: { in: ["PUBLIC", "FILLED"] },
    },
  });

  // Group by sector (via Branch.sector if available, else default)
  const byDimension = await prisma.$queryRaw<
    Array<{ sector: string | null; count: number; avgRate: number | null }>
  >`
    SELECT
      b.sector,
      COUNT(s.id) as count,
      AVG(s."hourlyRateCents") as "avgRate"
    FROM "Shift" s
    LEFT JOIN "Branch" b ON s."branchId" = b.id
    WHERE s."createdAt" >= ${startDate} AND s."createdAt" < ${endDate}
    GROUP BY b.sector
  `;

  const breakdown = buildBreakdown(byDimension);

  return {
    totalCount: totalShifts,
    activeCount: activeShifts,
    averageValue: byDimension[0]?.avgRate ? byDimension[0].avgRate / 100 : undefined,
    breakdown,
  };
}

/**
 * Aggregate application data (shift matches / responses).
 */
export async function aggregateApplications(snapshotDate: string): Promise<SnapshotMetrics> {
  const [startDate, endDate] = getDateBounds(snapshotDate);

  const totalApplications = await prisma.shiftMatch.count({
    where: {
      createdAt: { gte: startDate, lt: endDate },
    },
  });

  const acceptedApplications = await prisma.shiftMatch.count({
    where: {
      createdAt: { gte: startDate, lt: endDate },
      status: "ACCEPTED",
    },
  });

  const byDimension = await prisma.$queryRaw<
    Array<{ sector: string | null; count: number; responseRate: number | null }>
  >`
    SELECT
      b.sector,
      COUNT(m.id) as count,
      ROUND(100.0 * SUM(CASE WHEN m.status = 'ACCEPTED' THEN 1 ELSE 0 END) / COUNT(m.id), 2) as "responseRate"
    FROM "ShiftMatch" m
    LEFT JOIN "Shift" s ON m."shiftId" = s.id
    LEFT JOIN "Branch" b ON s."branchId" = b.id
    WHERE m."createdAt" >= ${startDate} AND m."createdAt" < ${endDate}
    GROUP BY b.sector
  `;

  const breakdown = buildBreakdown(byDimension);

  return {
    totalCount: totalApplications,
    activeCount: acceptedApplications,
    averageValue: calculateAverageRate(byDimension),
    breakdown,
  };
}

/**
 * Aggregate payment/billing data (invoices, credits, payouts).
 */
export async function aggregatePayments(snapshotDate: string): Promise<SnapshotMetrics> {
  const [startDate, endDate] = getDateBounds(snapshotDate);

  const invoices = await prisma.invoice.findMany({
    where: {
      createdAt: { gte: startDate, lt: endDate },
    },
    select: {
      totalCents: true,
      recipientTenantId: true,
    },
  });

  const totalValue = invoices.reduce((sum, inv) => sum + (inv.totalCents ?? 0), 0);
  const totalCount = invoices.length;

  // Group by tenant type (if we can determine employer vs worker)
  const breakdown: Record<string, Record<string, number>> = {
    totalByType: {
      invoices: totalCount,
      totalCents: totalValue,
    },
  };

  return {
    totalCount,
    activeCount: totalCount, // All invoices in period are "active"
    totalValue: totalValue,
    breakdown,
  };
}

/**
 * Aggregate worker profile data (registrations, completions, ratings).
 */
export async function aggregateWorkers(snapshotDate: string): Promise<SnapshotMetrics> {
  const [startDate, endDate] = getDateBounds(snapshotDate);

  const newWorkers = await prisma.user.count({
    where: {
      createdAt: { gte: startDate, lt: endDate },
      role: "FREELANCER",
    },
  });

  const verifiedWorkers = await prisma.user.count({
    where: {
      createdAt: { gte: startDate, lt: endDate },
      role: "FREELANCER",
      kycStatus: "VERIFIED",
    },
  });

  const breakdown: Record<string, Record<string, number>> = {
    byStatus: {
      new: newWorkers,
      verified: verifiedWorkers,
    },
  };

  return {
    totalCount: newWorkers,
    activeCount: verifiedWorkers,
    breakdown,
  };
}

/**
 * Create or update a daily snapshot in the data warehouse.
 */
export async function createSnapshot(
  dataType: DataType,
  snapshotDate: string,
  metrics: SnapshotMetrics,
  source = "batch-aggregation",
): Promise<void> {
  try {
    await prisma.dataSnapshot.upsert({
      where: { snapshotDate_dataType: { snapshotDate, dataType } },
      update: {
        totalCount: metrics.totalCount,
        activeCount: metrics.activeCount,
        averageValue: metrics.averageValue,
        totalValue: metrics.totalValue,
        breakdown: metrics.breakdown as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
      create: {
        snapshotDate,
        dataType,
        totalCount: metrics.totalCount,
        activeCount: metrics.activeCount,
        averageValue: metrics.averageValue,
        totalValue: metrics.totalValue,
        breakdown: metrics.breakdown as Prisma.InputJsonValue,
        source,
      },
    });
    logger.info(`Snapshot created: ${snapshotDate} ${dataType}`);
  } catch (err) {
    logger.error("Failed to create snapshot", {
      error: (err as Error).message,
      dataType,
      snapshotDate,
    });
  }
}

/**
 * Run daily snapshot aggregation for all data types.
 */
export async function runDailyAggregation(snapshotDate: string): Promise<void> {
  const types: DataType[] = ["shifts", "applications", "payments", "workers"];

  for (const dataType of types) {
    let metrics: SnapshotMetrics | null = null;

    switch (dataType) {
      case "shifts":
        metrics = await aggregateShifts(snapshotDate);
        break;
      case "applications":
        metrics = await aggregateApplications(snapshotDate);
        break;
      case "payments":
        metrics = await aggregatePayments(snapshotDate);
        break;
      case "workers":
        metrics = await aggregateWorkers(snapshotDate);
        break;
    }

    if (metrics) {
      await createSnapshot(dataType, snapshotDate, metrics);
    }
  }
}

/**
 * Query snapshots for a date range.
 */
export async function getSnapshots(
  dataType: DataType,
  startDate: string,
  endDate: string,
): Promise<Array<{ snapshotDate: string; metrics: SnapshotMetrics }>> {
  const rows = await prisma.dataSnapshot.findMany({
    where: {
      dataType,
      snapshotDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { snapshotDate: "asc" },
  });

  return rows.map((row) => ({
    snapshotDate: row.snapshotDate,
    metrics: {
      totalCount: row.totalCount,
      activeCount: row.activeCount,
      averageValue: row.averageValue ?? undefined,
      totalValue: row.totalValue ?? undefined,
      breakdown: (row.breakdown as Record<string, Record<string, number>>) ?? {},
    },
  }));
}

// === Helpers ===

function getDateBounds(dateStr: string): [Date, Date] {
  const date = new Date(dateStr);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return [start, end];
}

function buildBreakdown(
  rows: Array<{ sector: string | null; count: number; avgRate?: number | null; responseRate?: number | null }>,
): Record<string, Record<string, number | null>> {
  const breakdown: Record<string, Record<string, number | null>> = {};

  for (const row of rows) {
    const sector = row.sector ?? "unknown";
    breakdown[sector] = {
      count: row.count,
      avgRate: row.avgRate ? row.avgRate / 100 : null,
      responseRate: row.responseRate ?? null,
    };
  }

  return breakdown;
}

function calculateAverageRate(rows: Array<{ avgRate?: number | null }>): number | undefined {
  if (rows.length === 0 || !rows[0]?.avgRate) return undefined;
  return rows[0].avgRate / 100;
}
