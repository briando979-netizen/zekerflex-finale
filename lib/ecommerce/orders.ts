import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export async function getUserOrders(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } } },
  });
  if (!order) throw AppError.notFound("Order not found");
  return order;
}

export async function updateOrderStatus(orderId: string, status: string) {
  return prisma.order.update({
    where: { id: orderId },
    data: { status },
  });
}

export async function createReturn(orderId: string, itemId: string, reason: string) {
  const order = await getOrder(orderId);
  if (!order) throw AppError.notFound("Order not found");

  const returnRecord = await prisma.orderReturn.create({
    data: {
      orderId,
      itemId,
      reason,
      status: "PENDING",
    },
  });

  return returnRecord;
}

export async function getOrderReturns(orderId: string) {
  return prisma.orderReturn.findMany({
    where: { orderId },
    include: { item: true },
  });
}

export async function processRefund(returnId: string, amount: number) {
  const returnRecord = await prisma.orderReturn.findUnique({ where: { id: returnId } });
  if (!returnRecord) throw AppError.notFound("Return not found");

  await prisma.orderReturn.update({
    where: { id: returnId },
    data: { status: "APPROVED", refundAmount: amount },
  });

  const order = await getOrder(returnRecord.orderId);
  return { success: true, refundAmount: amount, orderTotal: order.total - amount };
}

export async function getOrderAnalytics(startDate: Date, endDate: Date) {
  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      status: { not: "CANCELLED" },
    },
    include: { items: true },
  });

  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  const totalOrders = orders.length;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const uniqueCustomers = new Set(orders.map((o) => o.userId)).size;

  return {
    totalRevenue,
    totalOrders,
    averageOrderValue,
    uniqueCustomers,
    conversionRate: uniqueCustomers > 0 ? (totalOrders / uniqueCustomers) * 100 : 0,
  };
}

export async function trackOrderStatus(orderId: string) {
  const order = await getOrder(orderId);
  return {
    orderId: order.id,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items,
    tracking: {
      estimated_delivery: new Date(order.createdAt.getTime() + 5 * 24 * 60 * 60 * 1000),
    },
  };
}
