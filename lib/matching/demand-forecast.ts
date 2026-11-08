import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { Skill } from "@prisma/client";

/**
 * Demand forecast for a specific skill at a location.
 */
export interface DemandForecast {
  skillId: string;
  skillName: string;
  date: Date;
  forecastedDemand: number; // number of shifts expected
  confidence: number; // [0, 1]
  factors: {
    historicalTrend: number; // [0, 1]
    seasonalFactor: number; // [0.5, 1.5]
    weatherFactor: number; // [0.8, 1.2]
    eventFactor: number; // [0.5, 2.0]
  };
}

/**
 * Get day of week as number (0 = Monday).
 */
function getDayOfWeek(date: Date): number {
  return (date.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0
}

/**
 * Get week of year.
 */
function getWeekOfYear(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * Calculate seasonal factor based on time of year.
 * Returns [0.5, 1.5] where 1.0 is baseline.
 * Accounts for holidays, summer vacation, etc.
 */
function calculateSeasonalFactor(date: Date): number {
  const month = date.getMonth();
  const day = date.getDate();

  // Dutch vacation/holiday patterns
  if (month === 7) return 0.6; // August vacation
  if (month === 11) return 1.3; // December holiday rush
  if (month === 3 && day >= 1 && day <= 7) return 0.8; // Easter
  if (month === 4) return 1.1; // Spring demand
  if (month === 9) return 1.2; // Back to school

  return 1.0; // Baseline
}

/**
 * Estimate weather impact on demand.
 * Returns [0.8, 1.2] where 1.0 is neutral.
 */
function estimateWeatherFactor(date: Date): number {
  // Simplified: weekends have different patterns
  const dayOfWeek = getDayOfWeek(date);

  if (dayOfWeek === 5 || dayOfWeek === 6) return 0.9; // Weekend lower demand
  return 1.0;
}

/**
 * Estimate major event impact on demand.
 * Returns [0.5, 2.0] where 1.0 is normal.
 */
function estimateEventFactor(date: Date): number {
  const dayOfWeek = getDayOfWeek(date);
  const month = date.getMonth();
  const day = date.getDate();

  // Major holidays/events boost demand
  if (month === 4 && day === 5) return 1.5; // Liberation Day (May 5)
  if (month === 11 && day === 25) return 1.4; // Christmas
  if (month === 0 && day === 1) return 0.5; // New Year (lower)

  return 1.0;
}

/**
 * Calculate historical trend from past shift volumes.
 * Returns [0, 1] normalized score.
 */
async function calculateHistoricalTrend(skillId: string | null, days = 90): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const pastShifts = await prisma.shift.findMany({
    where: {
      requiredSkillId: skillId ?? undefined,
      createdAt: {
        gte: cutoffDate,
      },
    },
    select: {
      startsAt: true,
    },
  });

  if (pastShifts.length === 0) return 0.5; // Default to 0.5 for new skills

  // Group by day and calculate average
  const shiftsPerDay: Record<string, number> = {};

  for (const shift of pastShifts) {
    const key = shift.startsAt.toISOString().split("T")[0];
    shiftsPerDay[key] = (shiftsPerDay[key] ?? 0) + 1;
  }

  const avg = Object.values(shiftsPerDay).reduce((a, b) => a + b, 0) / Object.keys(shiftsPerDay).length;

  // Normalize to [0, 1] assuming max ~20 shifts/day per skill
  return Math.min(avg / 20, 1);
}

/**
 * Forecast demand for a skill on a specific date.
 */
export async function forecastDemand(skillId: string | null, date: Date): Promise<DemandForecast> {
  const skill = skillId ? await prisma.skill.findUnique({ where: { id: skillId } }) : null;

  const historicalTrend = await calculateHistoricalTrend(skillId, 90);
  const seasonalFactor = calculateSeasonalFactor(date);
  const weatherFactor = estimateWeatherFactor(date);
  const eventFactor = estimateEventFactor(date);

  // Base forecast: 5 shifts/day normalized
  const baselineDemand = 5;

  // Apply all factors
  const combinedFactor = seasonalFactor * weatherFactor * eventFactor;
  const forecastedDemand = Math.round(baselineDemand * combinedFactor * (0.5 + historicalTrend));

  // Confidence decreases further in the future
  const daysInFuture = Math.max(0, (date.getTime() - new Date().getTime()) / (1000 * 86400));
  const confidence = Math.max(0.3, 1 - daysInFuture / 30); // Confidence decays to 0.3 over 30 days

  return {
    skillId: skillId ?? "general",
    skillName: skill?.naam ?? "General",
    date,
    forecastedDemand,
    confidence,
    factors: {
      historicalTrend,
      seasonalFactor,
      weatherFactor,
      eventFactor,
    },
  };
}

/**
 * Forecast demand across next N days for a skill.
 */
export async function forecastDemandMultiDay(
  skillId: string | null,
  startDate: Date,
  days: number,
): Promise<DemandForecast[]> {
  const forecasts: DemandForecast[] = [];

  for (let i = 0; i < days; i += 1) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    date.setHours(0, 0, 0, 0);

    const forecast = await forecastDemand(skillId, date);
    forecasts.push(forecast);
  }

  return forecasts;
}

/**
 * Calculate worker supply vs demand imbalance.
 * Returns [-1, 1] where positive = undersupply, negative = oversupply.
 */
export async function calculateImbalance(
  skillId: string | null,
  date: Date,
): Promise<{
  imbalance: number;
  demandEstimate: number;
  supplyEstimate: number;
}> {
  const forecast = await forecastDemand(skillId, date);

  // Count available workers for the skill
  let availableWorkers: number;

  if (skillId) {
    const withSkill = await prisma.freelancerSkill.count({
      where: { skillId },
    });
    availableWorkers = withSkill;
  } else {
    availableWorkers = await prisma.freelancerProfile.count();
  }

  // Simple ratio: if demand > supply/2, we're understaffed
  const supplyEstimate = availableWorkers / 2; // Assume 50% available on any given day
  const imbalance = (forecast.forecastedDemand - supplyEstimate) / Math.max(supplyEstimate, 1);

  return {
    imbalance: Math.max(-1, Math.min(1, imbalance)),
    demandEstimate: forecast.forecastedDemand,
    supplyEstimate: Math.round(supplyEstimate),
  };
}

/**
 * Identify skills with undersupply over the next week.
 * Useful for targeting recruitment campaigns.
 */
export async function findUndersuppliedSkills(
  days: number = 7,
  imbalanceThreshold: number = 0.2,
): Promise<
  Array<{
    skillId: string;
    skillName: string;
    avgImbalance: number;
    urgencyScore: number; // [0, 1]
  }>
> {
  const skills = await prisma.skill.findMany({
    select: { id: true, naam: true },
  });

  const startDate = new Date();

  const results: Array<{
    skillId: string;
    skillName: string;
    avgImbalance: number;
    urgencyScore: number;
  }> = [];

  for (const skill of skills) {
    let totalImbalance = 0;
    let validDays = 0;

    for (let i = 0; i < days; i += 1) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      const { imbalance } = await calculateImbalance(skill.id, date);

      if (imbalance > 0) {
        totalImbalance += imbalance;
        validDays += 1;
      }
    }

    const avgImbalance = validDays > 0 ? totalImbalance / validDays : 0;

    if (avgImbalance >= imbalanceThreshold) {
      results.push({
        skillId: skill.id,
        skillName: skill.naam,
        avgImbalance,
        urgencyScore: Math.min(avgImbalance, 1),
      });
    }
  }

  return results.sort((a, b) => b.urgencyScore - a.urgencyScore);
}

/**
 * Predict peak demand times for resource planning.
 */
export async function predictPeakDemandTimes(skillId: string | null, days: number = 30): Promise<{
  peakDates: Date[];
  averageDemand: number;
  maxDemand: number;
  minDemand: number;
}> {
  const forecasts = await forecastDemandMultiDay(skillId, new Date(), days);

  const demands = forecasts.map((f) => f.forecastedDemand);
  const avgDemand = demands.reduce((a, b) => a + b, 0) / demands.length;
  const maxDemand = Math.max(...demands);
  const minDemand = Math.min(...demands);
  const threshold = avgDemand + (maxDemand - avgDemand) * 0.5; // Top 50% of peak

  const peakDates = forecasts
    .filter((f) => f.forecastedDemand >= threshold)
    .map((f) => f.date);

  return {
    peakDates,
    averageDemand: Math.round(avgDemand),
    maxDemand,
    minDemand,
  };
}
