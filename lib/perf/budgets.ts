export const performanceBudgets = {
  javascript: { default: 170, route: 100 },
  css: { default: 50, route: 30 },
  images: { default: 200, route: 100 },
  fonts: { default: 100, route: 50 },
  thirdParty: { default: 300, total: 500 },
};

export const webVitalsBudgets = {
  fcp: 1500,
  lcp: 2500,
  cls: 0.1,
  tti: 3500,
  fid: 100,
};

export interface BudgetCheck {
  metric: string;
  budget: number;
  actual: number;
  status: 'pass' | 'warn' | 'fail';
  delta: number;
}

export const checkBudget = (metric: string, actual: number): BudgetCheck => {
  const budget = performanceBudgets[metric as keyof typeof performanceBudgets]?.default || 0;
  const delta = actual - budget;

  return {
    metric,
    budget,
    actual,
    status: delta < 0 ? 'pass' : delta < budget * 0.1 ? 'warn' : 'fail',
    delta,
  };
};

export const budgetTracking = {
  historical: new Map<string, number[]>(),
  threshold: 0.05,
};

export const trackBudgetTrend = (metric: string, value: number) => {
  const history = budgetTracking.historical.get(metric) || [];
  history.push(value);
  if (history.length > 30) history.shift();
  budgetTracking.historical.set(metric, history);
};

export const detectRegressions = (metric: string): boolean => {
  const history = budgetTracking.historical.get(metric) || [];
  if (history.length < 5) return false;

  const recent = history.slice(-5);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const baseline = history[0];

  return (avg - baseline) / baseline > budgetTracking.threshold;
};

export const cicdEnforcement = {
  enabled: true,
  failOnRegression: true,
  warnThreshold: 0.05,
};
