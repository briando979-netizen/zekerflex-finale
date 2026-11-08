import { prisma } from "@/lib/prisma";

export async function getSalesMetrics(startDate: Date, endDate: Date) {
  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      status: { not: "CANCELLED" },
    },
    include: { items: true },
  });

  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  const totalOrders = orders.length;
  const totalItems = orders.reduce((sum, order) => sum + order.items.length, 0);
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return {
    totalRevenue,
    totalOrders,
    totalItems,
    averageOrderValue,
  };
}

export async function getConversionMetrics(startDate: Date, endDate: Date) {
  const carts = await prisma.shoppingCart.findMany({
    where: { createdAt: { gte: startDate, lte: endDate } },
  });

  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      status: { not: "CANCELLED" },
    },
  });

  const conversionRate = carts.length > 0 ? (orders.length / carts.length) * 100 : 0;
  const cartAbandonmentRate = carts.length > 0 ? ((carts.length - orders.length) / carts.length) * 100 : 0;

  return {
    cartsCreated: carts.length,
    ordersCompleted: orders.length,
    conversionRate,
    cartAbandonmentRate,
  };
}

export async function getProductPerformance(limit = 10) {
  const items = await prisma.orderItem.groupBy({
    by: ["productId"],
    _sum: { quantity: true, price: true },
    _count: true,
    orderBy: { _sum: { price: "desc" } },
    take: limit,
  });

  return items.map((item) => ({
    productId: item.productId,
    unitsSold: item._sum.quantity || 0,
    revenue: item._sum.price || 0,
    orders: item._count,
    averagePrice: item._count > 0 ? (item._sum.price || 0) / item._count : 0,
  }));
}

export async function getCustomerLifetimeValue() {
  const customers = await prisma.order.groupBy({
    by: ["userId"],
    _sum: { total: true },
    _count: true,
    orderBy: { _sum: { total: "desc" } },
  });

  const totalLTV = customers.reduce((sum, c) => sum + (c._sum.total || 0), 0);
  const averageLTV = customers.length > 0 ? totalLTV / customers.length : 0;

  return {
    totalCustomers: customers.length,
    averageLTV,
    topCustomers: customers.slice(0, 10),
  };
}

export async function getRevenueByChannel(startDate: Date, endDate: Date) {
  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      status: { not: "CANCELLED" },
    },
  });

  const byChannel: Record<string, number> = {
    direct: 0,
    affiliate: 0,
    referral: 0,
    other: 0,
  };

  orders.forEach((order) => {
    const channel = order.source || "direct";
    byChannel[channel] = (byChannel[channel] || 0) + order.total;
  });

  return byChannel;
}

export async function getRefundMetrics(startDate: Date, endDate: Date) {
  const returns = await prisma.orderReturn.findMany({
    where: { createdAt: { gte: startDate, lte: endDate } },
  });

  const approved = returns.filter((r) => r.status === "APPROVED");
  const totalRefunded = approved.reduce((sum, r) => sum + (r.refundAmount || 0), 0);
  const refundRate = (approved.length / returns.length) * 100 || 0;

  return {
    totalReturns: returns.length,
    approvedReturns: approved.length,
    totalRefunded,
    refundRate,
  };
}

export async function getDashboardMetrics(startDate: Date, endDate: Date) {
  const sales = await getSalesMetrics(startDate, endDate);
  const conversion = await getConversionMetrics(startDate, endDate);
  const products = await getProductPerformance(5);
  const ltv = await getCustomerLifetimeValue();
  const revenue = await getRevenueByChannel(startDate, endDate);
  const refunds = await getRefundMetrics(startDate, endDate);

  return {
    sales,
    conversion,
    topProducts: products,
    customerMetrics: ltv,
    revenueByChannel: revenue,
    refunds,
  };
}
