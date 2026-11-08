import { prisma } from "@/lib/prisma";

export async function getScheduleAnalytics(startDate: Date, endDate: Date) {
  const shifts = await prisma.shift.findMany({
    where: {
      startTime: { gte: startDate, lte: endDate },
    },
    include: { assignments: true },
  });

  const total = shifts.length;
  const filled = shifts.filter((s) => s.assignments.length > 0).length;
  const fillRate = total > 0 ? (filled / total) * 100 : 0;

  const utilization = shifts.reduce((acc, s) => {
    const hours = (s.endTime.getTime() - s.startTime.getTime()) / 1000 / 3600;
    const assigned = s.assignments.length > 0 ? 1 : 0;
    return acc + (assigned * hours) / hours;
  }, 0) / total;

  return {
    period: { start: startDate, end: endDate },
    totalShifts: total,
    filledShifts: filled,
    fillRate: Math.round(fillRate),
    utilizationRate: Math.round((utilization / total) * 100 || 0),
    avgAssignmentsPerShift: (shifts.reduce((a, s) => a + s.assignments.length, 0) / total).toFixed(2),
  };
}

export async function getFreelancerUtilization(freelancerId: string, monthStart: Date, monthEnd: Date) {
  const assignments = await prisma.assignment.findMany({
    where: {
      freelancer: { userId: freelancerId },
      shift: {
        startTime: { gte: monthStart, lte: monthEnd },
      },
    },
    include: { shift: true },
  });

  const totalHours = assignments.reduce((acc, a) => {
    const hours = (a.shift.endTime.getTime() - a.shift.startTime.getTime()) / 1000 / 3600;
    return acc + hours;
  }, 0);

  return {
    freelancerId,
    period: { start: monthStart, end: monthEnd },
    shiftsWorked: assignments.length,
    totalHours: totalHours.toFixed(1),
    avgHoursPerShift: (totalHours / assignments.length).toFixed(1),
    estimatedEarnings: (totalHours * 18).toFixed(2), // ~€18/hr base
  };
}

export async function getDemandForecast(daysAhead: number = 7) {
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);

  const upcomingShifts = await prisma.shift.findMany({
    where: {
      startTime: { gte: new Date(), lte: future },
      status: "OPEN",
    },
    orderBy: { startTime: "asc" },
  });

  const dailyDemand = upcomingShifts.reduce(
    (acc: Record<string, number>, shift) => {
      const day = shift.startTime.toISOString().split("T")[0];
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    },
    {}
  );

  return {
    forecastDays: daysAhead,
    totalOpenShifts: upcomingShifts.length,
    dailyDemand,
    peakDemandDay: Object.entries(dailyDemand).sort((a, b) => (b[1] as number) - (a[1] as number))[0],
  };
}
