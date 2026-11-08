import { performance } from 'perf_hooks';

interface Metric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

interface MetricsStore {
  metrics: Metric[];
  flush(): Promise<void>;
}

const metrics: Metric[] = [];

export const recordMetric = (
  name: string,
  value: number,
  tags?: Record<string, string>
): void => {
  metrics.push({
    name,
    value,
    timestamp: Date.now(),
    tags,
  });
};

export const recordLatency = (
  endpoint: string,
  duration: number,
  status: number
): void => {
  recordMetric('http.request.duration', duration, {
    endpoint,
    status: String(status),
  });
};

export const recordErrorRate = (error: string, endpoint: string): void => {
  recordMetric('http.request.errors', 1, { error, endpoint });
};

export const recordThroughput = (endpoint: string): void => {
  recordMetric('http.request.throughput', 1, { endpoint });
};

export const getMetrics = (): Metric[] => [...metrics];

export const clearMetrics = (): void => {
  metrics.length = 0;
};

export const getMetricStats = (
  name: string
): {
  count: number;
  min: number;
  max: number;
  avg: number;
} | null => {
  const filtered = metrics.filter((m) => m.name === name);
  if (filtered.length === 0) return null;

  const values = filtered.map((m) => m.value);
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a, b) => a + b) / values.length,
  };
};
