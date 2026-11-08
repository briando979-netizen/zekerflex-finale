import { prisma } from "@/lib/prisma";

export async function updateProductForecast(productId: string, tenantId: string) {
  const product = await prisma.inventoryProduct.findUnique({
    where: { id: productId },
    include: { stock: true },
  });
  if (!product || !product.stock) throw new Error(`Product not found`);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const movements = await prisma.inventoryMovement.findMany({
    where: { productId, tenantId, type: "SALE", createdAt: { gte: ninetyDaysAgo } },
  });
  if (movements.length === 0) return updateForecastRecord(productId, tenantId, 0, 0, 0, 0);
  const totalSales = Math.abs(movements.reduce((sum: number, m: any) => sum + m.quantity, 0));
  const avgDailySales = Math.round(totalSales / 90);
  return updateForecastRecord(productId, tenantId, 0, 1, avgDailySales, 0);
}

async function updateForecastRecord(productId: string, tenantId: string, trend: number, seasonality: number, avgSales: number, volatility: number) {
  const existing = await prisma.inventoryForecast.findUnique({ where: { productId } });
  if (existing) {
    return prisma.inventoryForecast.update({
      where: { productId },
      data: { trend, seasonality, avgSales, volatility, updatedAt: new Date() },
    });
  }
  return prisma.inventoryForecast.create({
    data: { productId, tenantId, trend, seasonality, avgSales, volatility, forecastQty: 0, forecastDate: new Date() },
  });
}

export async function getProductForecast(productId: string) {
  const forecast = await prisma.inventoryForecast.findUnique({ where: { productId } });
  if (!forecast) throw new Error(`Forecast not found`);
  return forecast;
}

export async function getLowStockForecasts(tenantId: string, daysAhead: number = 30) {
  return prisma.inventoryForecast.findMany({ where: { tenantId }, take: 50 });
}

export async function generateForecastReport(tenantId: string) {
  const forecasts = await prisma.inventoryForecast.findMany({ where: { tenantId } });
  return { generatedAt: new Date(), totalProducts: forecasts.length, forecasts };
}

export async function updateAllForecasts(tenantId: string) {
  const products = await prisma.inventoryProduct.findMany({ where: { tenantId } });
  return { completedAt: new Date(), totalProducts: products.length };
}
