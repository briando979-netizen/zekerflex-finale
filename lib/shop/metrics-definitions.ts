// KPI & business metrics definitions

export interface KPI {
  id: string;
  name: string;
  description: string;
  category: "revenue" | "retention" | "growth" | "satisfaction";
  targetValue: number;
  currentValue: number;
  unit: string;
  trend: "up" | "down" | "stable";
}

export const SHOP_KPIs: Record<string, KPI> = {
  mrr: {
    id: "mrr",
    name: "MRR (Monthly Recurring Revenue)",
    description: "Predictable monthly revenue from subscriptions",
    category: "revenue",
    targetValue: 100000, // €1000
    currentValue: 0,
    unit: "€",
    trend: "up",
  },
  arr: {
    id: "arr",
    name: "ARR (Annual Recurring Revenue)",
    description: "MRR × 12",
    category: "revenue",
    targetValue: 1200000,
    currentValue: 0,
    unit: "€",
    trend: "up",
  },
  churn_rate: {
    id: "churn_rate",
    name: "Monthly Churn Rate",
    description: "% of subscriptions canceled per month",
    category: "retention",
    targetValue: 5, // Max 5% monthly
    currentValue: 0,
    unit: "%",
    trend: "down",
  },
  ltv_cac_ratio: {
    id: "ltv_cac_ratio",
    name: "LTV:CAC Ratio",
    description: "Lifetime Value vs Customer Acquisition Cost",
    category: "growth",
    targetValue: 3, // 3x or higher
    currentValue: 0,
    unit: "x",
    trend: "up",
  },
  nps: {
    id: "nps",
    name: "Net Promoter Score",
    description: "Customer satisfaction & loyalty",
    category: "satisfaction",
    targetValue: 50,
    currentValue: 0,
    unit: "points",
    trend: "up",
  },
  trial_conversion: {
    id: "trial_conversion",
    name: "Trial-to-Paid",
    description: "% of trials that convert to paid",
    category: "growth",
    targetValue: 30,
    currentValue: 0,
    unit: "%",
    trend: "up",
  },
};

export function formatKPI(kpi: KPI): string {
  const target = kpi.unit === "%" ? `${kpi.targetValue}%` : `${kpi.unit}${kpi.targetValue}`;
  const current = kpi.unit === "%" ? `${kpi.currentValue}%` : `${kpi.unit}${kpi.currentValue}`;
  return `${kpi.name}: ${current} (target: ${target})`;
}
