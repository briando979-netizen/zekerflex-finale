export interface BenchmarkResult {
  name: string;
  duration: number;
  timestamp: Date;
  metadata: Record<string, any>;
}

const results: BenchmarkResult[] = [];

export const coreWebVitals = {
  fcp: { name: 'First Contentful Paint', target: 1500 },
  lcp: { name: 'Largest Contentful Paint', target: 2500 },
  cls: { name: 'Cumulative Layout Shift', target: 0.1 },
  tti: { name: 'Time to Interactive', target: 3500 },
  fid: { name: 'First Input Delay', target: 100 },
};

export const syntheticMonitoring = {
  endpoints: [
    { url: '/dashboard', timeout: 3000 },
    { url: '/marketplace', timeout: 3000 },
    { url: '/api/shifts', timeout: 1000 },
  ],
  interval: 300000,
};

export const realUserMetrics = {
  enabled: true,
  sampling: 0.1,
  sendToEndpoint: process.env.APM_ENDPOINT,
};

export const runBenchmark = (name: string, fn: () => void): BenchmarkResult => {
  const start = performance.now();
  fn();
  const duration = performance.now() - start;

  const result: BenchmarkResult = {
    name,
    duration,
    timestamp: new Date(),
    metadata: {},
  };

  results.push(result);
  return result;
};

export const getBenchmarkStats = (metric: string) => {
  const metric_results = results.filter(r => r.name === metric);
  if (metric_results.length === 0) return null;

  const durations = metric_results.map(r => r.duration);
  return {
    min: Math.min(...durations),
    max: Math.max(...durations),
    avg: durations.reduce((a, b) => a + b, 0) / durations.length,
    p95: durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)],
    count: durations.length,
  };
};

export const competitorAnalysis = {
  enabled: true,
  competitors: ['competitor1.com', 'competitor2.com'],
  metrics: ['lcp', 'fcp', 'cls'],
};

export const regressionDetection = {
  enabled: true,
  threshold: 0.15,
};
