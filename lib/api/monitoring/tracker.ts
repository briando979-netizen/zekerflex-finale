interface ApiMetrics {
  endpoint: string;
  method: string;
  timestamp: Date;
  statusCode: number;
  latency: number;
  requestSize: number;
  responseSize: number;
  userId?: string;
  appId?: string;
  error?: string;
}

interface EndpointStats {
  endpoint: string;
  method: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  errorRate: number;
}

interface TrafficPattern {
  hour: number;
  requestCount: number;
  avgLatency: number;
  errorRate: number;
}

class ApiMonitor {
  private metrics: ApiMetrics[] = [];
  private metricsWindow = 7 * 24 * 60 * 60 * 1000; // 7 days

  recordMetric(metric: Omit<ApiMetrics, "timestamp">): void {
    this.metrics.push({
      ...metric,
      timestamp: new Date(),
    });

    // Clean old metrics
    const cutoff = Date.now() - this.metricsWindow;
    this.metrics = this.metrics.filter((m) => m.timestamp.getTime() > cutoff);
  }

  getEndpointStats(endpoint: string, method: string): EndpointStats | null {
    const endpointMetrics = this.metrics.filter(
      (m) => m.endpoint === endpoint && m.method === method
    );

    if (endpointMetrics.length === 0) return null;

    const latencies = endpointMetrics.map((m) => m.latency).sort((a, b) => a - b);
    const successCount = endpointMetrics.filter((m) => m.statusCode < 400).length;
    const failureCount = endpointMetrics.length - successCount;

    return {
      endpoint,
      method,
      totalRequests: endpointMetrics.length,
      successfulRequests: successCount,
      failedRequests: failureCount,
      avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      minLatency: latencies[0],
      maxLatency: latencies[latencies.length - 1],
      p50Latency: latencies[Math.floor(latencies.length * 0.5)],
      p95Latency: latencies[Math.floor(latencies.length * 0.95)],
      p99Latency: latencies[Math.floor(latencies.length * 0.99)],
      errorRate: failureCount / endpointMetrics.length,
    };
  }

  getTrafficPatterns(endpoint?: string): TrafficPattern[] {
    const filteredMetrics = endpoint
      ? this.metrics.filter((m) => m.endpoint === endpoint)
      : this.metrics;

    const patterns: Map<number, { count: number; latencies: number[]; errors: number }> = new Map();

    for (const metric of filteredMetrics) {
      const hour = metric.timestamp.getHours();
      if (!patterns.has(hour)) {
        patterns.set(hour, { count: 0, latencies: [], errors: 0 });
      }

      const pattern = patterns.get(hour)!;
      pattern.count++;
      pattern.latencies.push(metric.latency);
      if (metric.statusCode >= 400) pattern.errors++;
    }

    const result: TrafficPattern[] = [];
    for (const [hour, pattern] of patterns) {
      result.push({
        hour,
        requestCount: pattern.count,
        avgLatency: pattern.latencies.reduce((a, b) => a + b, 0) / pattern.latencies.length,
        errorRate: pattern.errors / pattern.count,
      });
    }

    return result.sort((a, b) => a.hour - b.hour);
  }

  getErrorAnalysis(limit = 10): Array<{ error: string; count: number; lastSeen: Date }> {
    const errorMap: Map<string, { count: number; lastSeen: Date }> = new Map();

    for (const metric of this.metrics) {
      if (metric.error) {
        if (!errorMap.has(metric.error)) {
          errorMap.set(metric.error, { count: 0, lastSeen: new Date() });
        }

        const errorData = errorMap.get(metric.error)!;
        errorData.count++;
        errorData.lastSeen = metric.timestamp;
      }
    }

    return Array.from(errorMap.entries())
      .map(([error, data]) => ({ error, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  getLatencySummary(): { p50: number; p95: number; p99: number; avg: number } {
    if (this.metrics.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avg: 0 };
    }

    const latencies = this.metrics.map((m) => m.latency).sort((a, b) => a - b);
    return {
      p50: latencies[Math.floor(latencies.length * 0.5)],
      p95: latencies[Math.floor(latencies.length * 0.95)],
      p99: latencies[Math.floor(latencies.length * 0.99)],
      avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    };
  }

  healthCheck(): { healthy: boolean; errorRate: number; latencyP99: number } {
    const summary = this.getLatencySummary();
    const failedRequests = this.metrics.filter((m) => m.statusCode >= 400).length;
    const errorRate = failedRequests / Math.max(this.metrics.length, 1);

    return {
      healthy: errorRate < 0.05 && summary.p99 < 1000,
      errorRate,
      latencyP99: summary.p99,
    };
  }
}

export { ApiMonitor, type ApiMetrics, type EndpointStats, type TrafficPattern };
