import { prisma } from "@/lib/prisma";

export async function generateRevenueChart(tenantId: string, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const bookings = await prisma.booking.findMany({
    where: {
      tenantId,
      datumTijd: { gte: startDate },
      status: { in: ["COMPLETED", "CONFIRMED"] },
    },
    select: { datumTijd: true, bedragCent: true },
  });

  const dailyData: Record<string, number> = {};
  
  for (const booking of bookings) {
    const date = booking.datumTijd.toISOString().split("T")[0];
    dailyData[date] = (dailyData[date] || 0) + (booking.bedragCent || 0) / 100;
  }

  return Object.entries(dailyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({
      date,
      revenue: Math.round(revenue),
    }));
}

export async function generateCustomerChart(tenantId: string, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const bookings = await prisma.booking.findMany({
    where: {
      tenantId,
      datumTijd: { gte: startDate },
    },
    select: { datumTijd: true, klantEmail: true },
  });

  const dailyCustomers: Record<string, Set<string>> = {};

  for (const booking of bookings) {
    const date = booking.datumTijd.toISOString().split("T")[0];
    if (!dailyCustomers[date]) dailyCustomers[date] = new Set();
    dailyCustomers[date].add(booking.klantEmail);
  }

  return Object.entries(dailyCustomers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, customers]) => ({
      date,
      customers: customers.size,
    }));
}

export async function generateProductChart(tenantId: string) {
  const topProducts = await prisma.booking.groupBy({
    by: ["productId"],
    where: { tenantId },
    _count: { id: true },
    _sum: { bedragCent: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });

  const products = await prisma.product.findMany({
    where: { id: { in: topProducts.map((p) => p.productId).filter(Boolean) as string[] } },
    select: { id: true, naam: true },
  });

  return topProducts.map((p) => ({
    naam: products.find((prod) => prod.id === p.productId)?.naam || "Unknown",
    count: p._count.id,
    revenue: Math.round((p._sum.bedragCent || 0) / 100),
  }));
}
