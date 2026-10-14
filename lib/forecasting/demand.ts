import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Demand Forecasting Engine
//
// Predicts shift demand for a branch over a future window.
// Uses moving average baseline + day-of-week seasonal index + weekly trend.
// Duration is derived from endsAt - startsAt (Shift has no durationMinutes).
// ---------------------------------------------------------------------------

export interface ForecastInput {
  tenantId: string;
  branchId?: string | undefined;
  fromDate: Date;
  days: number;
}

export interface DayForecast {
  date: string;
  dayOfWeek: number;
  predictedShifts: number;
  predictedFte: number;
  confidenceLow: number;
  confidenceHigh: number;
  seasonalIndex: number;
}

export interface ForecastResult {
  tenantId: string;
  branchId?: string | undefined;
  generatedAt: string;
  days: DayForecast[];
  trendWeeklyPct: number;
  dataPointsUsed: number;
  note?: string | undefined;
}

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  return arr.reduce((acc, t) => { const k = key(t); (acc[k] ??= []).push(t); return acc; }, {} as Record<string, T[]>);
}

function flatForecast(input: ForecastInput, note: string): ForecastResult {
  const days: DayForecast[] = [];
  for (let i = 0; i < input.days; i++) {
    const d = addDays(input.fromDate, i);
    days.push({ date: isoDate(d), dayOfWeek: d.getDay(), predictedShifts: 2, predictedFte: 16, confidenceLow: 0, confidenceHigh: 4, seasonalIndex: 1 });
  }
  return { tenantId: input.tenantId, branchId: input.branchId, generatedAt: new Date().toISOString(), days, trendWeeklyPct: 0, dataPointsUsed: 0, note };
}

export async function forecastDemand(input: ForecastInput): Promise<ForecastResult> {
  const lookbackMs = 90 * 86400_000;
  const lookbackStart = new Date(input.fromDate.getTime() - lookbackMs);

  // Find branches that belong to this tenant
  const branchWhere = input.branchId
    ? { id: input.branchId }
    : { tenantId: input.tenantId };

  const branches = await prisma.branch.findMany({ where: branchWhere, select: { id: true } }).catch(() => []);
  const branchIds = branches.map((b) => b.id);
  if (branchIds.length === 0) return flatForecast(input, "Geen vestigingen gevonden voor deze tenant.");

  const shifts = await prisma.shift.findMany({
    where: { branchId: { in: branchIds }, startsAt: { gte: lookbackStart, lt: input.fromDate } },
    select: { startsAt: true, endsAt: true },
  }).catch(() => [] as Array<{ startsAt: Date; endsAt: Date }>);

  if (shifts.length === 0) {
    logger.warn("demand-forecast: geen historische data", { tenantId: input.tenantId });
    return flatForecast(input, "Onvoldoende historische data — vlakke schatting.");
  }

  const byDate = groupBy(shifts, (s) => isoDate(s.startsAt));
  const dateStats = Object.entries(byDate).map(([date, ss]) => ({
    date,
    dow: new Date(date).getDay(),
    count: ss.length,
    hours: ss.reduce((h, s) => h + (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000, 0),
  }));

  const dowGroups = groupBy(dateStats, (s) => String(s.dow));
  const overallAvg = dateStats.reduce((s, d) => s + d.count, 0) / (dateStats.length || 1);
  const dowIndex: Record<number, number> = {};
  for (let dow = 0; dow < 7; dow++) {
    const group = dowGroups[String(dow)] ?? [];
    dowIndex[dow] = group.length === 0 ? 1 : (group.reduce((s, d) => s + d.count, 0) / group.length) / (overallAvg || 1);
  }

  const mid = new Date(lookbackStart.getTime() + lookbackMs / 2);
  const recentCount = shifts.filter((s) => s.startsAt >= mid).length;
  const olderCount = shifts.filter((s) => s.startsAt < mid).length;
  const trendWeeklyPct = olderCount > 0 ? ((recentCount - olderCount) / olderCount) * 100 : 0;

  const weeks = Math.max(1, lookbackMs / (7 * 86400_000));
  const avgPerDay = shifts.length / (weeks * 7);
  const avgHoursPerShift = shifts.reduce((h, s) => h + (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000, 0) / Math.max(1, shifts.length);

  const days: DayForecast[] = [];
  for (let i = 0; i < input.days; i++) {
    const d = addDays(input.fromDate, i);
    const dow = d.getDay();
    const idx = dowIndex[dow] ?? 1;
    const trendFactor = 1 + (trendWeeklyPct / 100) * (i / 7);
    const predicted = Math.max(0, Math.round(avgPerDay * idx * trendFactor));
    const stdDev = Math.max(1, predicted * 0.3);
    days.push({ date: isoDate(d), dayOfWeek: dow, predictedShifts: predicted, predictedFte: Math.round(predicted * avgHoursPerShift * 10) / 10, confidenceLow: Math.max(0, Math.round(predicted - stdDev)), confidenceHigh: Math.round(predicted + stdDev), seasonalIndex: Math.round(idx * 100) / 100 });
  }

  return {
    tenantId: input.tenantId,
    branchId: input.branchId,
    generatedAt: new Date().toISOString(),
    days,
    trendWeeklyPct: Math.round(trendWeeklyPct * 10) / 10,
    dataPointsUsed: shifts.length,
  };
}
