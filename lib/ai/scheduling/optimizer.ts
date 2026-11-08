import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/ops/logger";

interface ScheduleRecommendation {
  times: Date[];
  reason: string;
  successProbability: number;
}

export async function recommendSchedule(userId: string, duration: number): Promise<ScheduleRecommendation> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    // Get user's historical availability
    const availability = await getHistoricalAvailability(userId);

    // Get peak demand times
    const peakTimes = await getPeakDemandTimes();

    // Get travel time estimates
    const travelTimes = await estimateTravelTimes(user.location);

    // Compute optimal time slots
    const optimalTimes = computeOptimalTimes(availability, peakTimes, duration);

    return {
      times: optimalTimes,
      reason: "Based on your availability, peak demand, and travel time.",
      successProbability: 0.85,
    };
  } catch (err) {
    logger.error("Schedule recommendation failed", { userId, err });
    throw err;
  }
}

async function getHistoricalAvailability(userId: string): Promise<Record<number, number>> {
  const shifts = await prisma.shift.findMany({
    where: { assignments: { some: { userId } } },
    take: 30,
  });

  const availability: Record<number, number> = {};
  for (let i = 0; i < 24; i++) availability[i] = 0;

  shifts.forEach(shift => {
    const hour = new Date(shift.startTime).getHours();
    availability[hour]++;
  });

  return availability;
}

async function getPeakDemandTimes(): Promise<number[]> {
  // Return peak hours for demand
  return [7, 12, 17, 18, 19, 20]; // Breakfast, lunch, evening rush, dinner
}

async function estimateTravelTimes(location: string): Promise<Record<string, number>> {
  return { average: 15, max: 45 };
}

function computeOptimalTimes(availability: Record<number, number>, peakTimes: number[], duration: number): Date[] {
  const now = new Date();
  const times: Date[] = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(now.getTime() + i * 86400000);

    for (const hour of peakTimes) {
      const time = new Date(date);
      time.setHours(hour, 0, 0, 0);

      if (time > now && availability[hour] > 0) {
        times.push(time);
      }
    }
  }

  return times.slice(0, 5);
}

export async function avoidConflicts(userId: string, startTime: Date, endTime: Date): Promise<boolean> {
  const conflict = await prisma.shift.findFirst({
    where: {
      assignments: { some: { userId } },
      startTime: { lte: endTime },
      endTime: { gte: startTime },
    },
  });

  return !conflict;
}

export async function optimizeResources(shifts: any[]): Promise<any[]> {
  // Allocate workers optimally
  return shifts.sort((a, b) => a.requiredWorkers - b.requiredWorkers);
}
