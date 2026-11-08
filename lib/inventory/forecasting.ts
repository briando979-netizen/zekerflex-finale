import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export async function getForecast(tenantId: string, productId: string) {
  return prisma.inventoryForecast.findUnique({
    where: { productId },
  });
}

export async function calculateForecast(tenantId: string, productId: string) {
  // Get historical sales
  const movements = await prisma.inventoryMovement.findMany({
    where: {
      tenantId,
      productId,
      type: "SALE",
      createdAt: {
        gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // last 90 days
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (movements.length === 0) {
    return null;
  }

  // Calculate basic metrics
  const totalSales = movements.reduce((sum, m) => sum + m.quantity, 0);
  const days = Math.ceil((Date.now() - movements[0].createdAt.getTime()) / (1000 * 60 * 60 * 24)) || 1;
  const avgDaily = totalSales / days;

  // Calculate volatility (simple standard deviation)
  const daily = new Map<string, number>();
  movements.forEach((m) => {
    const date = m.createdAt.toISOString().split("T")[0];
    daily.set(date, (daily.get(date) || 0) + m.quantity);
  });

  const dailyValues = Array.from(daily.values());
  const mean = dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length;
  const variance = dailyValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / dailyValues.length;
  const volatility = Math.sqrt(variance);

  // Simple seasonality detection (comparing recent vs older)
  const recent = movements.filter((m) => m.createdAt.getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000);
  const older = movements.filter((m) => m.createdAt.getTime() <= Date.now() - 30 * 24 * 60 * 60 * 1000);

  const recentAvg = recent.length > 0 ? recent.reduce((sum, m) => sum + m.quantity, 0) / 30 : avgDaily;
  const olderAvg = older.length > 0 ? older.reduce((sum, m) => sum + m.quantity, 0) / 30 : avgDaily;

  const seasonality = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;

  // Forecast for next 30 days
  const trend = seasonality;
  const forecastQty = Math.ceil(avgDaily * 30 * (1 + trend));

  // Get current stock
  const stock = await prisma.inventoryStock.findUnique({
    where: { productId },
  });

  const currentStock = stock?.currentLevel || 0;
  const predictedStockOut = currentStock > 0 ? new Date(Date.now() + (currentStock / avgDaily) * 24 * 60 * 60 * 1000) : new Date();

  // Recommended reorder (cover 30 days + buffer for volatility)
  const buffer = Math.ceil(volatility * 1.5);
  const recommendedReorder = Math.max(forecastQty + buffer, stock?.reorderQty || 0);

  const forecast = await prisma.inventoryForecast.upsert({
    where: { productId },
    create: {
      productId,
      tenantId,
      forecastQty,
      forecastDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      trend,
      seasonality: Math.round(seasonality * 100) / 100,
      avgSales: Math.round(avgDaily),
      volatility: Math.round(volatility * 100) / 100,
      predictedStockOut,
      recommendedReorder,
    },
    update: {
      forecastQty,
      forecastDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      trend,
      seasonality: Math.round(seasonality * 100) / 100,
      avgSales: Math.round(avgDaily),
      volatility: Math.round(volatility * 100) / 100,
      predictedStockOut,
      recommendedReorder,
    },
  });

  return forecast;
}

export async function listForecasts(tenantId: string) {
  return prisma.inventoryForecast.findMany({
    where: { tenantId },
  });
}

export async function getStockOutAlerts(tenantId: string) {
  const forecasts = await prisma.inventoryForecast.findMany({
    where: {
      tenantId,
      predictedStockOut: {
        lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // next 2 weeks
      },
    },
  });

  return forecasts;
}

export async function refreshAllForecasts(tenantId: string) {
  const products = await prisma.inventoryProduct.findMany({
    where: { tenantId, archived: false },
    select: { id: true },
  });

  const results = [];
  for (const product of products) {
    const forecast = await calculateForecast(tenantId, product.id);
    if (forecast) results.push(forecast);
  }

  return results;
}
