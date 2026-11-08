export interface PerformanceMetric {
  endpoint: string;
  method: string;
  avgResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  totalRequests: number;
  errorRate: number;
  throughput: number;
}

const metrics = new Map<string, { times: number[]; errors: number }>();

export function recordMetric(endpoint: string, responseTime: number, error = false) {
  const key = endpoint;
  if (!metrics.has(key)) {
    metrics.set(key, { times: [], errors: 0 });
  }

  const metric = metrics.get(key)!;
  metric.times.push(responseTime);
  if (error) metric.errors++;

  if (metric.times.length > 1000) {
    metric.times = metric.times.slice(-500);
  }
}

export function getMetric(endpoint: string): PerformanceMetric | null {
  const metric = metrics.get(endpoint);
  if (!metric || metric.times.length === 0) return null;

  const times = metric.times;
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const max = Math.max(...times);
  const min = Math.min(...times);

  return {
    endpoint,
    method: "GET",
    avgResponseTime: Math.round(avg),
    maxResponseTime: max,
    minResponseTime: min,
    totalRequests: times.length,
    errorRate: Math.round((metric.errors / times.length) * 100),
    throughput: Math.round(times.length / 60),
  };
}

export function getAllMetrics(): PerformanceMetric[] {
  const results: PerformanceMetric[] = [];
  for (const [endpoint] of metrics) {
    const metric = getMetric(endpoint);
    if (metric) results.push(metric);
  }
  return results.sort((a, b) => b.avgResponseTime - a.avgResponseTime);
}

export function clearMetrics() {
  metrics.clear();
}
