import { prisma } from "@/lib/prisma";

export async function predictOptimalPricing(tenantId: string, productId: string) {
  const bookings = await prisma.booking.findMany({
    where: {
      tenantId,
      productId,
      status: { in: ["COMPLETED", "CONFIRMED"] },
    },
    orderBy: { datumTijd: "desc" },
    take: 100,
  });

  if (bookings.length < 10) {
    return { recommendation: "INSUFFICIENT_DATA", confidence: 0 };
  }

  const prices = bookings.map((b) => (b.bedragCent || 0) / 100);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const maxPrice = Math.max(...prices);

  const optimalPrice = avgPrice * 1.15;

  return {
    currentAverage: Math.round(avgPrice),
    recommended: Math.round(optimalPrice),
    potentialRevenue: Math.round(optimalPrice * bookings.length),
    confidence: 0.85,
  };
}

export async function predictDemandByTime(tenantId: string) {
  const bookings = await prisma.booking.findMany({
    where: { tenantId },
    select: { datumTijd: true },
  });

  const hourCounts: Record<number, number> = {};

  for (const booking of bookings) {
    const hour = booking.datumTijd.getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  }

  const peakHours = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => parseInt(hour));

  return {
    peakHours,
    recommendations: `Staffing peak at ${peakHours.join(", ")} hours`,
  };
}

export async function calculateCustomerLifetimeValue(tenantId: string, customerEmail: string) {
  const bookings = await prisma.booking.findMany({
    where: {
      tenantId,
      klantEmail: customerEmail,
      status: { in: ["COMPLETED", "CONFIRMED"] },
    },
  });

  const totalSpent = bookings.reduce((sum, b) => sum + (b.bedragCent || 0), 0) / 100;
  const frequency = bookings.length / (30 / 30);
  const projected12months = frequency * 12 * (totalSpent / Math.max(bookings.length, 1));

  return {
    totalHistorical: Math.round(totalSpent),
    bookings: bookings.length,
    averagePerBooking: Math.round(totalSpent / Math.max(bookings.length, 1)),
    projected12Months: Math.round(projected12months),
    retention: Math.min(100, (bookings.length / Math.max(bookings.length, 12)) * 100),
  };
}
