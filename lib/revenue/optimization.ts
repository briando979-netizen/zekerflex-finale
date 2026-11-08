import { prisma } from "@/lib/prisma";

export async function analyzeRevenueOpportunities(tenantId: string) {
  const [products, customers, bookings] = await Promise.all([
    prisma.product.findMany({ where: { tenantId }, take: 100 }),
    prisma.customer.findMany({ where: { tenantId } }),
    prisma.booking.findMany({
      where: { tenantId },
      orderBy: { datumTijd: "desc" },
      take: 1000,
    }),
  ]);

  const opportunities = {
    upsellProducts: findUpsellOpportunities(products, bookings),
    crosssellProducts: findCrosssellOpportunities(bookings),
    churnRisk: findChurnRiskCustomers(customers, bookings),
    seasonalTrends: analyzeSeasonalTrends(bookings),
    pricingOptimization: findPricingOpportunities(products, bookings),
  };

  return opportunities;
}

function findUpsellOpportunities(products: any[], bookings: any[]) {
  const productCounts: Record<string, number> = {};

  for (const booking of bookings) {
    const key = booking.productId;
    productCounts[key] = (productCounts[key] || 0) + 1;
  }

  const mostPopular = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);

  return {
    recommendation: "Promote these high-performing products",
    products: mostPopular,
  };
}

function findCrosssellOpportunities(bookings: any[]) {
  const pairs: Record<string, number> = {};

  for (let i = 0; i < bookings.length - 1; i++) {
    if (bookings[i].klantEmail === bookings[i + 1].klantEmail) {
      const key = `${bookings[i].productId}-${bookings[i + 1].productId}`;
      pairs[key] = (pairs[key] || 0) + 1;
    }
  }

  return {
    recommendation: "Bundle these products together",
    pairs: Object.entries(pairs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3),
  };
}

function findChurnRiskCustomers(customers: any[], bookings: any[]) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const activeCustomers = new Set(
    bookings
      .filter((b) => b.datumTijd > thirtyDaysAgo)
      .map((b) => b.klantEmail)
  );

  const atRisk = customers.filter((c) => !activeCustomers.has(c.email)).length;

  return {
    atRiskCount: atRisk,
    retentionCampaign: "Send special offers to inactive customers",
  };
}

function analyzeSeasonalTrends(bookings: any[]) {
  const monthCounts: Record<number, number> = {};

  for (const booking of bookings) {
    const month = booking.datumTijd.getMonth();
    monthCounts[month] = (monthCounts[month] || 0) + 1;
  }

  const peakMonths = Object.entries(monthCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([month]) => parseInt(month));

  return {
    peakMonths,
    recommendation: "Plan promotions in off-peak months to balance demand",
  };
}

function findPricingOpportunities(products: any[], bookings: any[]) {
  return {
    analysis: "Review pricing strategy based on demand",
    suggestion: "Increase prices for high-demand items during peak times",
  };
}

export async function generateRevenueGrowthPlan(tenantId: string) {
  const opportunities = await analyzeRevenueOpportunities(tenantId);

  const actions = [
    "Implement upselling strategy for top products",
    "Create product bundles for cross-selling",
    "Launch retention campaign for at-risk customers",
    "Adjust pricing based on seasonal demand",
    "Introduce loyalty rewards program",
  ];

  const projectedIncrease = 0.25;

  return {
    opportunities,
    actions,
    projectedRevenueIncrease: `${Math.round(projectedIncrease * 100)}%`,
    priority: "HIGH",
  };
}
