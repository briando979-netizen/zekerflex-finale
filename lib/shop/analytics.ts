// Sales analytics & insights

export interface SalesMetrics {
  totalRevenueC ents: number;
  orderCount: number;
  subscriptionCount: number;
  churnRate: number; // percentage
  arpu: number; // average revenue per user
  ltv: number; // lifetime value
  period: "day" | "week" | "month";
}

export interface ConversionFunnel {
  visitors: number;
  addedToCart: number;
  startedCheckout: number;
  completed: number;
  conversionRate: number; // percentage
}

export interface CohortAnalysis {
  cohortDate: Date;
  customersInCohort: number;
  retentionByMonth: Record<number, number>; // month -> retention %
  churnCurve: number[]; // churn % by month
}

export function calculateMetrics(
  orders: Array<{ totalCents: number; purchaseMode: "onetime" | "subscription" }>,
  subscriptions: Array<{ monthlyPriceCents: number; status: string }>
): SalesMetrics {
  const totalRevenueCents = orders.reduce((sum, o) => sum + o.totalCents, 0);
  const subscriptionRevenue = subscriptions.reduce((sum, s) => sum + s.monthlyPriceCents, 0);

  return {
    totalRevenueCents: totalRevenueCents + subscriptionRevenue,
    orderCount: orders.length,
    subscriptionCount: subscriptions.length,
    churnRate: 5, // TODO: calculate from cancellations
    arpu: subscriptions.length > 0 ? subscriptionRevenue / subscriptions.length : 0,
    ltv: subscriptionRevenue * 12 * 3, // Assume 3-year lifetime
    period: "month",
  };
}

export const ANALYTICS_DASHBOARD_METRICS = [
  { key: "revenue", label: "Omzet", icon: "💰" },
  { key: "orders", label: "Bestellingen", icon: "📦" },
  { key: "subscriptions", label: "Abonnementen", icon: "🔄" },
  { key: "churn", label: "Afval", icon: "📉" },
  { key: "arpu", label: "Gem. waarde/klant", icon: "📊" },
];
