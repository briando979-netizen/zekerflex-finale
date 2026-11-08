export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags: Record<string, string>;
}

export interface APMConfig {
  enabled: boolean;
  sampleRate: number;
  endpoints: string[];
}

const metrics: PerformanceMetric[] = [];

export const recordMetric = (
  name: string,
  value: number,
  unit: string,
  tags: Record<string, string> = {}
) => {
  metrics.push({
    name,
    value,
    unit,
    timestamp: new Date(),
    tags,
  });

  if (metrics.length > 10000) metrics.shift();
};

export const webVitals = {
  fcp: { target: 1500, unit: 'ms' },
  lcp: { target: 2500, unit: 'ms' },
  cls: { target: 0.1, unit: 'score' },
  tti: { target: 3500, unit: 'ms' },
  fid: { target: 100, unit: 'ms' },
};

export const apmEndpoints = [
  { url: process.env.APM_ENDPOINT, key: 'APM_KEY' },
];

export const errorTracking = {
  enabled: true,
  sampleRate: 1.0,
  ignorePatterns: [/script error/i, /ResizeObserver loop/i],
};

export const distributedTracing = {
  enabled: true,
  sampleRate: 0.1,
  headerName: 'X-Trace-ID',
};

export const logAggregation = {
  enabled: true,
  levels: ['error', 'warn', 'info'],
  retention: 604800,
};

export const alertThresholds = {
  errorRate: 0.05,
  latencyP95: 1000,
  cpuUsage: 80,
  memoryUsage: 85,
  diskUsage: 90,
};

export const getMetricsSummary = () => ({
  count: metrics.length,
  lastHour: metrics.filter(m => m.timestamp.getTime() > Date.now() - 3600000),
  avgResponse: metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length || 0,
});

export const alertIfThresholdExceeded = (metric: PerformanceMetric) => {
  const threshold = alertThresholds[metric.name as keyof typeof alertThresholds];
  if (threshold && metric.value > threshold) {
    console.error(`[ALERT] ${metric.name} exceeded threshold: ${metric.value} > ${threshold}`);
    return true;
  }
  return false;
};
