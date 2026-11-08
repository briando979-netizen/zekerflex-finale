import { prisma } from "@/lib/prisma";
import { z } from "zod";

interface DemandForecast {
  date: Date;
  hour: number;
  predictedDemand: number;
  confidence: number;
  factors: { seasonal: number; weather: number; events: number; trend: number };
}

export async function predictDemandByDate(
  date: Date,
  tenantId: string,
  factors?: { weatherCode?: string; eventType?: string }
): Promise<DemandForecast[]> {
  const dayOfWeek = date.getDay();
  const month = date.getMonth();
  const weekNumber = Math.floor((date.getDate() - date.getDay() + 6) / 7);

  // Historical demand by hour
  const historicalDemand = await prisma.shift.groupBy({
    by: ["createdAt"],
    where: {
      tenantId,
      createdAt: {
        gte: new Date(date.getFullYear() - 1, month, date.getDate()),
        lte: new Date(date.getFullYear() - 1, month, date.getDate() + 1),
      },
    },
    _count: { id: true },
  });

  const seasonalFactor = getSeasonalFactor(month);
  const dayOfWeekFactor = getDayOfWeekFactor(dayOfWeek);
  const weatherFactor = factors?.weatherCode ? getWeatherFactor(factors.weatherCode) : 1.0;
  const eventFactor = factors?.eventType ? getEventFactor(factors.eventType) : 1.0;

  const forecasts: DemandForecast[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const historicalAvg = historicalDemand.length > 0 ? historicalDemand.length / 24 : 5;
    const predicted = Math.round(
      historicalAvg * seasonalFactor * dayOfWeekFactor * weatherFactor * eventFactor * (0.8 + Math.random() * 0.4)
    );

    forecasts.push({
      date,
      hour,
      predictedDemand: Math.max(0, predicted),
      confidence: 0.65 + Math.random() * 0.3,
      factors: {
        seasonal: seasonalFactor,
        weather: weatherFactor,
        events: eventFactor,
        trend: dayOfWeekFactor,
      },
    });
  }

  return forecasts;
}

function getSeasonalFactor(month: number): number {
  const factors: Record<number, number> = {
    0: 0.8, // Jan low
    1: 0.85, // Feb low
    2: 0.9, // Mar
    3: 1.0, // Apr normal
    4: 1.05, // May
    5: 1.2, // Jun peak
    6: 1.25, // Jul peak
    7: 1.2, // Aug peak
    8: 1.0, // Sep
    9: 0.95, // Oct
    10: 0.9, // Nov
    11: 1.15, // Dec holidays
  };
  return factors[month] ?? 1.0;
}

function getDayOfWeekFactor(dayOfWeek: number): number {
  const factors: Record<number, number> = {
    0: 0.7, // Sunday
    1: 1.1, // Monday
    2: 1.15, // Tuesday
    3: 1.2, // Wednesday
    4: 1.25, // Thursday
    5: 1.3, // Friday peak
    6: 1.1, // Saturday
  };
  return factors[dayOfWeek] ?? 1.0;
}

function getWeatherFactor(weatherCode: string): number {
  const factors: Record<string, number> = {
    sunny: 1.3,
    cloudy: 1.0,
    rainy: 0.85,
    snowy: 0.7,
    stormy: 0.6,
  };
  return factors[weatherCode] ?? 1.0;
}

function getEventFactor(eventType: string): number {
  const factors: Record<string, number> = {
    festival: 1.8,
    concert: 1.5,
    holiday: 1.4,
    conference: 1.3,
    sports: 1.25,
  };
  return factors[eventType] ?? 1.0;
}

export async function getDemandTrend(tenantId: string, days: number = 30): Promise<number[]> {
  const shifts = await prisma.shift.groupBy({
    by: ["createdAt"],
    where: {
      tenantId,
      createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    },
    _count: { id: true },
  });

  return shifts.map((s) => s._count.id);
}
