import { prisma } from "@/lib/prisma";
import { predictDemandByDate } from "./prediction";

interface ShiftRecommendation {
  date: Date;
  hour: number;
  recommendedShiftCount: number;
  basePricePerHour: number;
  suggestedPricingPerHour: number;
  skillsNeeded: string[];
  urgencyScore: number;
}

export async function recommendShifts(
  tenantId: string,
  date: Date,
  basePricePerHour: number = 1500 // €15.00 in cents
): Promise<ShiftRecommendation[]> {
  const forecasts = await predictDemandByDate(date, tenantId);
  const recommendations: ShiftRecommendation[] = [];

  for (const forecast of forecasts) {
    const recommendedCount = Math.ceil(forecast.predictedDemand / 2); // 2 customers per worker estimate
    const urgency = Math.min(forecast.predictedDemand / 20, 1.0);

    recommendations.push({
      date: forecast.date,
      hour: forecast.hour,
      recommendedShiftCount: recommendedCount,
      basePricePerHour,
      suggestedPricingPerHour: calculateOptimalPrice(basePricePerHour, forecast.confidence, urgency),
      skillsNeeded: getSkillsForHour(forecast.hour),
      urgencyScore: urgency,
    });
  }

  return recommendations;
}

function calculateOptimalPrice(basePrice: number, confidence: number, urgency: number): number {
  const confidenceFactor = 1.0 + (confidence - 0.5) * 0.1;
  const urgencyFactor = 1.0 + urgency * 0.3;
  return Math.round(basePrice * confidenceFactor * urgencyFactor);
}

function getSkillsForHour(hour: number): string[] {
  if (hour >= 6 && hour <= 11) return ["breakfast", "service", "hospitality"];
  if (hour >= 11 && hour <= 14) return ["lunch", "service", "bartending"];
  if (hour >= 17 && hour <= 22) return ["dinner", "service", "cooking"];
  return ["general", "cleaning", "support"];
}

export async function suggestOptimalShiftTiming(
  tenantId: string,
  demandRange: number = 3 // hours
): Promise<{ startHour: number; endHour: number; peakDemand: number }> {
  const today = new Date();
  const forecasts = await predictDemandByDate(today, tenantId);

  let maxDemand = 0;
  let peakHour = 0;

  for (const f of forecasts) {
    if (f.predictedDemand > maxDemand) {
      maxDemand = f.predictedDemand;
      peakHour = f.hour;
    }
  }

  const startHour = Math.max(0, peakHour - Math.floor(demandRange / 2));
  const endHour = Math.min(24, peakHour + Math.ceil(demandRange / 2));

  return { startHour, endHour, peakDemand: maxDemand };
}
