import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { type Prisma } from "@prisma/client";

/**
 * OLAP Cubes — Multi-dimensional analysis with drill-down capabilities.
 * Pre-compute cubes for fast queries on shifts, workers, and sectors.
 */

export interface OlapCubeConfig {
  name: string;
  dimensions: string[]; // e.g., ["sector", "city", "date", "workerTier"]
  measures: string[]; // e.g., ["count", "avgRate", "totalRevenue"]
}

export interface CubeCell {
  [dimension: string]: string | number;
  [measure: string]: number | null;
}

export interface OlapData {
  dimensions: string[];
  measures: string[];
  cells: CubeCell[];
}

// Pre-defined cube configurations
const STANDARD_CUBES: Record<string, OlapCubeConfig> = {
  ShiftPerformance: {
    name: "ShiftPerformance",
    dimensions: ["sector", "city", "status"],
    measures: ["count", "avgHourlyRate", "totalHours"],
  },
  WorkerProductivity: {
    name: "WorkerProductivity",
    dimensions: ["tier", "sector", "completionStatus"],
    measures: ["count", "avgRating", "totalEarnings"],
  },
  ApplicationFunnel: {
    name: "ApplicationFunnel",
    dimensions: ["sector", "date", "responseStatus"],
    measures: ["applicantCount", "acceptanceRate"],
  },
};

/**
 * Build a ShiftPerformance cube — analyze shifts by sector, city, status.
 */
export async function buildShiftPerformanceCube(): Promise<OlapData> {
  const rows = await prisma.$queryRaw<
    Array<{
      sector: string | null;
      city: string | null;
      status: string;
      count: number;
      avgRate: number | null;
    }>
  >`
    SELECT
      b.sector,
      b.city,
      s.status,
      COUNT(s.id)::int as count,
      AVG(s."hourlyRateCents")::numeric as "avgRate"
    FROM "Shift" s
    LEFT JOIN "Branch" b ON s."branchId" = b.id
    GROUP BY b.sector, b.city, s.status
  `;

  const cells: CubeCell[] = rows.map((row) => ({
    sector: row.sector ?? "unknown",
    city: row.city ?? "unknown",
    status: row.status,
    count: row.count,
    avgHourlyRate: row.avgRate ? Number((row.avgRate / 100).toFixed(2)) : null,
    totalHours: 0, // Would calculate from shift duration if available
  }));

  return {
    dimensions: ["sector", "city", "status"],
    measures: ["count", "avgHourlyRate", "totalHours"],
    cells,
  };
}

/**
 * Build a WorkerProductivity cube — analyze workers by tier, sector, completion.
 */
export async function buildWorkerProductivityCube(): Promise<OlapData> {
  // Note: This is a simplified version; actual tier/rating data would come from
  // more detailed user profile tables.
  const rows = await prisma.$queryRaw<
    Array<{
      tier: string;
      sector: string | null;
      completionStatus: string;
      count: number;
    }>
  >`
    SELECT
      COALESCE(u."badgeLevel", 'BRONZE') as tier,
      b.sector,
      CASE
        WHEN m.status = 'ACCEPTED' THEN 'completed'
        WHEN m.status = 'REJECTED' THEN 'rejected'
        ELSE 'pending'
      END as "completionStatus",
      COUNT(m.id)::int as count
    FROM "ShiftMatch" m
    LEFT JOIN "User" u ON m."responderId" = u.id
    LEFT JOIN "Shift" s ON m."shiftId" = s.id
    LEFT JOIN "Branch" b ON s."branchId" = b.id
    GROUP BY u."badgeLevel", b.sector, "completionStatus"
  `;

  const cells: CubeCell[] = rows.map((row) => ({
    tier: row.tier,
    sector: row.sector ?? "unknown",
    completionStatus: row.completionStatus,
    count: row.count,
    avgRating: null, // Would pull from separate rating table
    totalEarnings: 0, // Would sum from invoices
  }));

  return {
    dimensions: ["tier", "sector", "completionStatus"],
    measures: ["count", "avgRating", "totalEarnings"],
    cells,
  };
}

/**
 * Build an ApplicationFunnel cube — track application flow by sector and date.
 */
export async function buildApplicationFunnelCube(): Promise<OlapData> {
  const rows = await prisma.$queryRaw<
    Array<{
      sector: string | null;
      date: string;
      responseStatus: string;
      count: number;
    }>
  >`
    SELECT
      b.sector,
      DATE(m."createdAt") as date,
      m.status as "responseStatus",
      COUNT(m.id)::int as count
    FROM "ShiftMatch" m
    LEFT JOIN "Shift" s ON m."shiftId" = s.id
    LEFT JOIN "Branch" b ON s."branchId" = b.id
    GROUP BY b.sector, DATE(m."createdAt"), m.status
    ORDER BY DATE(m."createdAt") DESC
    LIMIT 1000
  `;

  const cells: CubeCell[] = rows.map((row) => ({
    sector: row.sector ?? "unknown",
    date: row.date,
    responseStatus: row.responseStatus,
    applicantCount: row.count,
    acceptanceRate: row.responseStatus === "ACCEPTED" ? 100 : 0,
  }));

  return {
    dimensions: ["sector", "date", "responseStatus"],
    measures: ["applicantCount", "acceptanceRate"],
    cells,
  };
}

/**
 * Save a computed cube to the database.
 */
export async function saveCube(name: string, data: OlapData): Promise<void> {
  const config = STANDARD_CUBES[name];
  if (!config) {
    logger.warn(`Unknown cube: ${name}`);
    return;
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hour TTL

  try {
    await prisma.analyticsCube.upsert({
      where: { name },
      update: {
        data: data as Prisma.InputJsonValue,
        expiresAt,
        builtAt: new Date(),
      },
      create: {
        name,
        dimensions: data.dimensions,
        measures: data.measures,
        data: data as Prisma.InputJsonValue,
        expiresAt,
        builtAt: new Date(),
      },
    });
    logger.info(`Cube saved: ${name} with ${data.cells.length} cells`);
  } catch (err) {
    logger.error("Failed to save cube", { error: (err as Error).message, cubeName: name });
  }
}

/**
 * Retrieve a cube from the database.
 */
export async function getCube(name: string): Promise<OlapData | null> {
  const cube = await prisma.analyticsCube.findUnique({
    where: { name },
  });

  if (!cube || cube.expiresAt < new Date()) {
    return null;
  }

  return cube.data as OlapData;
}

/**
 * Drill down into a cube by filtering on specific dimension values.
 */
export async function drillDown(
  cubeName: string,
  filters: Record<string, string | number>,
): Promise<CubeCell[]> {
  const cube = await getCube(cubeName);
  if (!cube) {
    logger.warn(`Cube not found: ${cubeName}`);
    return [];
  }

  // Filter cells matching all specified dimensions
  const filtered = cube.cells.filter((cell) => {
    for (const [dim, value] of Object.entries(filters)) {
      if (cell[dim] !== value) {
        return false;
      }
    }
    return true;
  });

  return filtered;
}

/**
 * Perform aggregation across a cube on specific dimensions.
 */
export async function aggregateCube(
  cubeName: string,
  groupBy: string[],
  measure: string,
): Promise<Array<{ [key: string]: string | number | null }>> {
  const cube = await getCube(cubeName);
  if (!cube) {
    return [];
  }

  const groups = new Map<string, number>();

  for (const cell of cube.cells) {
    const key = groupBy.map((d) => cell[d]).join("|");
    const current = groups.get(key) ?? 0;
    const cellValue = cell[measure] as number | null;
    groups.set(key, current + (cellValue ?? 0));
  }

  return Array.from(groups.entries()).map(([key, value]) => {
    const parts = key.split("|");
    const result: Record<string, string | number | null> = {};
    groupBy.forEach((dim, i) => {
      result[dim] = parts[i];
    });
    result[measure] = value;
    return result;
  });
}

/**
 * Build all standard cubes (batch operation).
 */
export async function buildAllCubes(): Promise<void> {
  try {
    logger.info("Building OLAP cubes...");

    const [shiftCube, workerCube, funnelCube] = await Promise.all([
      buildShiftPerformanceCube(),
      buildWorkerProductivityCube(),
      buildApplicationFunnelCube(),
    ]);

    await Promise.all([
      saveCube("ShiftPerformance", shiftCube),
      saveCube("WorkerProductivity", workerCube),
      saveCube("ApplicationFunnel", funnelCube),
    ]);

    logger.info("All OLAP cubes built successfully");
  } catch (err) {
    logger.error("Failed to build OLAP cubes", { error: (err as Error).message });
  }
}
