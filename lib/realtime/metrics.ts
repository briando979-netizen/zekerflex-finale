export interface MetricSnapshot {
  timestamp: Date;
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
  requestsPerSecond: number;
  errorRate: number;
  p95Latency: number;
  databaseHealth: "healthy" | "degraded" | "down";
  cacheHitRate: number;
  queueDepth: number;
}

const metrics: MetricSnapshot[] = [];
const metricsListeners = new Set<(snapshot: MetricSnapshot) => void>();

export function subscribeMetrics(listener: (snapshot: MetricSnapshot) => void) {
  metricsListeners.add(listener);
  return () => metricsListeners.delete(listener);
}

export async function recordMetrics(partial: Partial<MetricSnapshot>) {
  const snapshot: MetricSnapshot = {
    timestamp: new Date(),
    cpuUsage: partial.cpuUsage ?? 0,
    memoryUsage: partial.memoryUsage ?? 0,
    activeConnections: partial.activeConnections ?? 0,
    requestsPerSecond: partial.requestsPerSecond ?? 0,
    errorRate: partial.errorRate ?? 0,
    p95Latency: partial.p95Latency ?? 0,
    databaseHealth: partial.databaseHealth ?? "healthy",
    cacheHitRate: partial.cacheHitRate ?? 0,
    queueDepth: partial.queueDepth ?? 0,
  };

  metrics.push(snapshot);
  if (metrics.length > 10000) metrics.shift();

  metricsListeners.forEach((l) => l(snapshot));
}

export function getMetricsHistory(minutes = 60): MetricSnapshot[] {
  const cutoff = new Date(Date.now() - minutes * 60000);
  return metrics.filter((m) => m.timestamp >= cutoff);
}

export function getLatestMetrics(): MetricSnapshot | undefined {
  return metrics[metrics.length - 1];
}

export function getAverageMetrics(minutes = 60): Partial<MetricSnapshot> {
  const history = getMetricsHistory(minutes);
  if (history.length === 0) return {};

  const avg = {
    cpuUsage: history.reduce((sum, m) => sum + m.cpuUsage, 0) / history.length,
    memoryUsage: history.reduce((sum, m) => sum + m.memoryUsage, 0) / history.length,
    requestsPerSecond: history.reduce((sum, m) => sum + m.requestsPerSecond, 0) / history.length,
    errorRate: history.reduce((sum, m) => sum + m.errorRate, 0) / history.length,
    p95Latency: history.reduce((sum, m) => sum + m.p95Latency, 0) / history.length,
    cacheHitRate: history.reduce((sum, m) => sum + m.cacheHitRate, 0) / history.length,
    queueDepth: history.reduce((sum, m) => sum + m.queueDepth, 0) / history.length,
  };

  return avg;
}

export function getAlerts(): string[] {
  const latest = getLatestMetrics();
  if (!latest) return [];

  const alerts: string[] = [];

  if (latest.cpuUsage > 80) alerts.push(`High CPU: ${latest.cpuUsage.toFixed(1)}%`);
  if (latest.memoryUsage > 80) alerts.push(`High Memory: ${latest.memoryUsage.toFixed(1)}%`);
  if (latest.errorRate > 0.05) alerts.push(`High Error Rate: ${(latest.errorRate * 100).toFixed(2)}%`);
  if (latest.databaseHealth !== "healthy") alerts.push(`Database: ${latest.databaseHealth}`);
  if (latest.p95Latency > 1000) alerts.push(`High Latency: ${latest.p95Latency.toFixed(0)}ms`);
  if (latest.queueDepth > 1000) alerts.push(`Queue Depth: ${latest.queueDepth}`);

  return alerts;
}
