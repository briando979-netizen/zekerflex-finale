import { prisma } from '@/lib/prisma';

export async function forecastDemand(horizonMonths: number = 12) {
  const products = await prisma.product.findMany();
  const forecasts: Record<string, number[]> = {};

  for (const product of products) {
    const history = await getHistoricalDemand(product.id, 24);
    forecasts[product.id] = calculateForecast(history, horizonMonths);
  }

  return forecasts;
}

export async function salesOperationsPlan() {
  const forecast = await forecastDemand(12);
  const inventory = await getCurrentInventory();
  const capacity = await getProductionCapacity();

  const plan = {
    demand: forecast,
    inventory,
    capacity,
    adjustments: calculateAdjustments(forecast, inventory, capacity),
    recommendations: [],
  };

  return plan;
}

export async function adjustDemandForecast(productId: string, adjustmentFactors: { seasonal?: number; trend?: number; events?: number }) {
  const baseForecast = await calculateBaseForecast(productId);

  const seasonal = adjustmentFactors.seasonal || 1;
  const trend = adjustmentFactors.trend || 1;
  const events = adjustmentFactors.events || 1;

  return baseForecast.map(m => Math.ceil(m * seasonal * trend * events));
}

export async function demandShaping(productId: string, targetInventory: number) {
  const currentForecast = await calculateBaseForecast(productId);
  const currentInventory = await getProductInventory(productId);
  const deficit = targetInventory - currentInventory;

  return {
    promotionRecommendation: deficit > 100 ? 'REDUCE_DEMAND' : deficit < -100 ? 'INCREASE_DEMAND' : 'MAINTAIN',
    promotionDepth: Math.abs(deficit) > 200 ? '30%' : '10%',
    duration: '4_WEEKS',
    expectedImpact: Math.ceil(deficit * 0.4),
  };
}

function calculateForecast(history: number[], months: number) {
  if (history.length === 0) return Array(months).fill(0);

  const avg = history.reduce((a, b) => a + b, 0) / history.length;
  const trend = (history[history.length - 1] - history[0]) / history.length;
  const seasonalFactors = calculateSeasonality(history);

  return Array.from({ length: months }).map((_, i) => {
    const month = i % 12;
    return Math.ceil((avg + trend * i) * (seasonalFactors[month] || 1));
  });
}

function calculateSeasonality(history: number[]) {
  const seasonal: Record<number, number> = {};
  const monthAvg = Array(12).fill(0);
  const monthCount = Array(12).fill(0);

  history.forEach((val, idx) => {
    monthAvg[idx % 12] += val;
    monthCount[idx % 12]++;
  });

  for (let i = 0; i < 12; i++) {
    const avg = monthAvg[i] / (monthCount[i] || 1);
    const overallAvg = history.reduce((a, b) => a + b, 0) / history.length;
    seasonal[i] = avg / overallAvg || 1;
  }

  return seasonal;
}

async function getHistoricalDemand(productId: string, months: number) {
  const orders = await prisma.orderItem.findMany({
    where: {
      productId,
      createdAt: { gte: new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000) },
    },
  });

  return orders.map(o => o.quantity);
}

async function calculateBaseForecast(productId: string) {
  const history = await getHistoricalDemand(productId, 12);
  return calculateForecast(history, 12);
}

async function getCurrentInventory() {
  const inventory: Record<string, number> = {};
  const products = await prisma.product.findMany();

  for (const p of products) {
    inventory[p.id] = await getProductInventory(p.id);
  }

  return inventory;
}

async function getProductInventory(productId: string) {
  const stock = await prisma.inventory.findFirst({ where: { productId }, orderBy: { createdAt: 'desc' } });
  return stock?.quantity || 0;
}

async function getProductionCapacity() {
  return {
    monthly: 10000,
    daily: 400,
    currentUtilization: 0.65,
  };
}

function calculateAdjustments(forecast: Record<string, number[]>, inventory: Record<string, number>, capacity: any) {
  const adjustments: Record<string, any> = {};

  for (const [productId, demand] of Object.entries(forecast)) {
    const totalDemand = demand.reduce((a, b) => a + b, 0);
    const currentStock = inventory[productId] || 0;

    adjustments[productId] = {
      productionNeeded: Math.max(0, totalDemand - currentStock),
      safetyStock: Math.ceil(totalDemand / 12 * 0.2),
      recommendedOrder: Math.ceil(totalDemand / 12 * 1.5),
    };
  }

  return adjustments;
}
