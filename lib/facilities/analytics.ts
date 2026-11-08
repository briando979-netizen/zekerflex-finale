import { prisma } from "@/lib/prisma";

export async function getUtilizationReport(days: number = 30) {
  const spaces = await prisma.facilitySpace.findMany();
  const report = [];

  for (const space of spaces) {
    const bookings = await prisma.spaceBooking.findMany({
      where: {
        spaceId: space.id,
        startTime: { gte: new Date(Date.now() - days * 86400000) },
      },
    });

    const totalHours = days * 24;
    const bookedHours = bookings.reduce((sum, b) => {
      const hours = (b.endTime.getTime() - b.startTime.getTime()) / 3600000;
      return sum + hours;
    }, 0);

    const utilization = (bookedHours / totalHours) * 100;
    report.push({
      spaceId: space.id,
      spaceName: space.name,
      utilization: Math.round(utilization),
      bookingCount: bookings.length,
    });
  }

  return report.sort((a, b) => b.utilization - a.utilization);
}

export async function getCostAnalysis(days: number = 30) {
  const maintenance = await prisma.maintenanceTask.findMany({
    where: {
      status: "COMPLETED",
      completedAt: { gte: new Date(Date.now() - days * 86400000) },
    },
  });

  const energy = await prisma.energyConsumption.findMany({
    where: {
      recordedAt: { gte: new Date(Date.now() - days * 86400000) },
    },
  });

  const maintenanceCost = maintenance.reduce((sum, m) => sum + (m.cost || 0), 0);
  const energyCost = energy.reduce((sum, e) => sum + (e.consumption * 0.12), 0); // $0.12/kWh

  return {
    maintenanceCost,
    energyCost,
    totalCost: maintenanceCost + energyCost,
    costPerDay: (maintenanceCost + energyCost) / days,
  };
}

export async function getSpaceOptimizationAnalytics() {
  const utilization = await getUtilizationReport(30);
  const underutilized = utilization.filter((u) => u.utilization < 30);
  const overutilized = utilization.filter((u) => u.utilization > 80);

  return {
    totalSpaces: utilization.length,
    avgUtilization: Math.round(utilization.reduce((sum, u) => sum + u.utilization, 0) / utilization.length),
    underutilized: underutilized.length,
    overutilized: overutilized.length,
    recommendations: `Consider consolidating ${underutilized.length} underutilized spaces and expanding ${overutilized.length} overutilized spaces`,
  };
}

export async function getFacilityHealthScore() {
  const spaces = await prisma.facilitySpace.findMany();
  const utilization = await getUtilizationReport(30);
  const avgUtil = utilization.reduce((sum, u) => sum + u.utilization, 0) / utilization.length;

  const safety = await prisma.safetyIncident.count({
    where: { resolved: false },
  });

  const maintenance = await prisma.maintenanceTask.count({
    where: { status: "SCHEDULED" },
  });

  let score = 100;
  score -= Math.abs(avgUtil - 60) * 0.5; // Penalize under/over utilization
  score -= safety * 5;
  score -= maintenance * 2;

  return {
    overallScore: Math.max(0, Math.min(100, score)),
    utilizationScore: Math.round(Math.min(100, avgUtil)),
    safetyIssues: safety,
    pendingMaintenance: maintenance,
    status: score > 75 ? "GOOD" : score > 50 ? "FAIR" : "NEEDS_ATTENTION",
  };
}
