import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export const inventorySchema = z.object({
  sku: z.string(),
  currentLevel: z.number().positive(),
  reorderPoint: z.number().positive(),
  safetyStock: z.number().nonnegative(),
  leadTimeDays: z.number().positive(),
});

export async function optimizeInventory(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error('Product not found');

  const monthlyDemand = await calculateMonthlyDemand(productId);
  const optimalStock = (monthlyDemand * product.leadTimeDays) / 30 + (monthlyDemand * 0.2);
  const reorderPoint = monthlyDemand * product.leadTimeDays / 30;

  return {
    optimalStockLevel: Math.ceil(optimalStock),
    reorderPoint: Math.ceil(reorderPoint),
    safetyStock: Math.ceil(monthlyDemand * 0.2),
  };
}

async function calculateMonthlyDemand(productId: string): Promise<number> {
  const orders = await prisma.order.findMany({
    where: {
      items: { some: { productId } },
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    include: { items: true },
  });

  return orders.reduce((sum, order) => {
    const item = order.items.find(i => i.productId === productId);
    return sum + (item?.quantity || 0);
  }, 0);
}

export async function foreccastDemand(productId: string, monthsAhead: number) {
  const history = await prisma.orderItem.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });

  const avgMonthly = history.reduce((s, o) => s + o.quantity, 0) / Math.max(1, history.length);
  const trend = history.length > 6 ? (history[0].quantity - history[6].quantity) / 6 : 0;

  const forecast = Array.from({ length: monthsAhead }).map((_, i) => {
    return Math.ceil(avgMonthly + trend * (i + 1));
  });

  return forecast;
}
