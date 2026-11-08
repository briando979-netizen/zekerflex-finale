export interface CostMetric {
  service: string;
  cost: number;
  unit: string;
  period: string;
  timestamp: Date;
}

const costMetrics: CostMetric[] = [];

export const costTracking = {
  services: {
    compute: { provider: 'Vercel', unit: 'USD/mo' },
    database: { provider: 'Neon', unit: 'USD/mo' },
    storage: { provider: 'Vercel Blob', unit: 'USD/GB' },
    redis: { provider: 'Upstash', unit: 'USD/mo' },
    cdn: { provider: 'Cloudflare', unit: 'USD/mo' },
  },
};

export const recordCost = (service: string, cost: number, period: string) => {
  costMetrics.push({
    service,
    cost,
    unit: 'USD',
    period,
    timestamp: new Date(),
  });
};

export const monthlyCostEstimate = () => {
  const month = Math.floor(Date.now() / (30 * 86400000));
  const thisMonth = costMetrics.filter(
    m => Math.floor(m.timestamp.getTime() / (30 * 86400000)) === month
  );

  return {
    total: thisMonth.reduce((sum, m) => sum + m.cost, 0),
    byService: Object.fromEntries(
      [...new Set(thisMonth.map(m => m.service))].map(service => [
        service,
        thisMonth.filter(m => m.service === service).reduce((sum, m) => sum + m.cost, 0),
      ])
    ),
  };
};

export const costPerFeature = {
  shifts: { compute: 0.02, database: 0.01, storage: 0.005 },
  marketplace: { compute: 0.03, database: 0.02, cdn: 0.01 },
  analytics: { compute: 0.01, database: 0.05, storage: 0.02 },
};

export const budgetAlerts = {
  monthly: 5000,
  service: { compute: 2000, database: 1500, storage: 500 },
};

export const alertIfOverBudget = (currentCost: number) => {
  if (currentCost > budgetAlerts.monthly) {
    console.warn(`[COST ALERT] Monthly spend ${currentCost} exceeds budget ${budgetAlerts.monthly}`);
    return true;
  }
  return false;
};

export const costOptimization = {
  reserved: { compute: 0.7, database: 0.5 },
  spot: { compute: 0.3 },
};
