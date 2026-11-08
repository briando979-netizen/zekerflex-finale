import { prisma } from "@/lib/prisma";

export async function predictRevenueTrend(tenantId: string, days: number = 30) {
  const bookings = await prisma.booking.findMany({
    where: {
      tenantId,
      datumTijd: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      status: { in: ["COMPLETED", "CONFIRMED"] },
    },
  });

  const dailyRevenue = new Map<string, number>();

  for (const booking of bookings) {
    const date = booking.datumTijd.toISOString().split("T")[0];
    const current = dailyRevenue.get(date) || 0;
    dailyRevenue.set(date, current + (booking.bedragCent || 0));
  }

  const values = Array.from(dailyRevenue.values());
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  return {
    historicalAverage: Math.round(avg / 100),
    predictedNext7Days: Math.round((avg * 7) / 100),
    trend: values[values.length - 1] > avg ? "UP" : "DOWN",
    confidence: 0.75,
  };
}

export async function identifyBestCustomers(tenantId: string) {
  const bookings = await prisma.booking.groupBy({
    by: ["klantEmail"],
    where: { tenantId },
    _count: { id: true },
    _sum: { bedragCent: true },
    orderBy: { _sum: { bedragCent: "desc" } },
    take: 10,
  });

  return bookings.map((b) => ({
    email: b.klantEmail,
    bookings: b._count.id,
    totalSpent: Math.round((b._sum.bedragCent || 0) / 100),
  }));
}

export async function findChurnRisk(tenantId: string) {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const inactiveCustomers = await prisma.customer.findMany({
    where: {
      tenantId,
      createdAt: { lte: sixtyDaysAgo },
      bookings: {
        every: {
          datumTijd: { lte: sixtyDaysAgo },
        },
      },
    },
    take: 10,
  });

  return inactiveCustomers.map((c) => ({
    email: c.email,
    naam: c.naam,
    riskScore: 0.8,
  }));
}

export async function getProductRecommendations(tenantId: string) {
  const bestSellers = await prisma.booking.groupBy({
    by: ["productId"],
    where: { tenantId },
    _count: { id: true },
    _sum: { bedragCent: true },
    orderBy: { _count: { id: "desc" } },
    take: 5,
  });

  const underperformers = await prisma.product.findMany({
    where: {
      tenantId,
      bookings: {
        none: {},
      },
    },
    take: 5,
  });

  return {
    promote: bestSellers.slice(0, 3),
    removeOrRethink: underperformers.slice(0, 3),
  };
}
