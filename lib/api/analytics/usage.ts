interface UsageRecord {
  timestamp: Date;
  appId: string;
  userId?: string;
  endpoint: string;
  method: string;
  statusCode: number;
  requestCount: number;
  totalLatency: number;
  totalBytesIn: number;
  totalBytesOut: number;
  errorCount: number;
}

interface AppUsageStats {
  appId: string;
  period: "day" | "week" | "month";
  startDate: Date;
  endDate: Date;
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  avgLatency: number;
  totalBytesIn: number;
  totalBytesOut: number;
  topEndpoints: Array<{ endpoint: string; requestCount: number }>;
  costEstimate: number;
}

interface EndpointUsage {
  endpoint: string;
  method: string;
  requestCount: number;
  errorCount: number;
  avgLatency: number;
  p95Latency: number;
}

class UsageAnalytics {
  private records: UsageRecord[] = [];
  private costPerRequest = 0.001; // $0.001 per request
  private retentionPeriod = 90 * 24 * 60 * 60 * 1000; // 90 days

  recordUsage(record: Omit<UsageRecord, "timestamp">): void {
    this.records.push({ ...record, timestamp: new Date() });

    // Clean old records
    const cutoff = Date.now() - this.retentionPeriod;
    this.records = this.records.filter((r) => r.timestamp.getTime() > cutoff);
  }

  getAppUsageStats(appId: string, period: "day" | "week" | "month"): AppUsageStats | null {
    const now = new Date();
    let startDate: Date;

    if (period === "day") {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (period === "week") {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const appRecords = this.records.filter(
      (r) => r.appId === appId && r.timestamp >= startDate && r.timestamp <= now
    );

    if (appRecords.length === 0) return null;

    const totalRequests = appRecords.reduce((sum, r) => sum + r.requestCount, 0);
    const totalErrors = appRecords.reduce((sum, r) => sum + r.errorCount, 0);
    const totalLatency = appRecords.reduce((sum, r) => sum + r.totalLatency, 0);
    const totalBytesIn = appRecords.reduce((sum, r) => sum + r.totalBytesIn, 0);
    const totalBytesOut = appRecords.reduce((sum, r) => sum + r.totalBytesOut, 0);

    const endpointUsage: Map<string, { count: number; errors: number }> = new Map();
    for (const record of appRecords) {
      const key = `${record.endpoint}:${record.method}`;
      if (!endpointUsage.has(key)) {
        endpointUsage.set(key, { count: 0, errors: 0 });
      }
      const usage = endpointUsage.get(key)!;
      usage.count += record.requestCount;
      usage.errors += record.errorCount;
    }

    const topEndpoints = Array.from(endpointUsage.entries())
      .map(([endpoint, usage]) => ({ endpoint, requestCount: usage.count }))
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, 5);

    return {
      appId,
      period,
      startDate,
      endDate: now,
      totalRequests,
      totalErrors,
      errorRate: totalErrors / Math.max(totalRequests, 1),
      avgLatency: totalLatency / Math.max(totalRequests, 1),
      totalBytesIn,
      totalBytesOut,
      topEndpoints,
      costEstimate: totalRequests * this.costPerRequest,
    };
  }

  getEndpointUsage(endpoint: string, limit = 10): EndpointUsage[] {
    const endpointRecords = this.records.filter((r) => r.endpoint === endpoint);

    const usage: Map<string, EndpointUsage> = new Map();
    for (const record of endpointRecords) {
      const key = `${record.endpoint}:${record.method}`;
      if (!usage.has(key)) {
        usage.set(key, {
          endpoint: record.endpoint,
          method: record.method,
          requestCount: 0,
          errorCount: 0,
          avgLatency: 0,
          p95Latency: 0,
        });
      }

      const stats = usage.get(key)!;
      stats.requestCount += record.requestCount;
      stats.errorCount += record.errorCount;
      stats.avgLatency += record.totalLatency;
    }

    return Array.from(usage.values())
      .map((u) => ({
        ...u,
        avgLatency: u.avgLatency / Math.max(u.requestCount, 1),
      }))
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, limit);
  }

  getTopApps(limit = 10): Array<{ appId: string; requestCount: number; errorRate: number }> {
    const appStats: Map<string, { requests: number; errors: number }> = new Map();

    for (const record of this.records) {
      if (!appStats.has(record.appId)) {
        appStats.set(record.appId, { requests: 0, errors: 0 });
      }

      const stats = appStats.get(record.appId)!;
      stats.requests += record.requestCount;
      stats.errors += record.errorCount;
    }

    return Array.from(appStats.entries())
      .map(([appId, stats]) => ({
        appId,
        requestCount: stats.requests,
        errorRate: stats.errors / Math.max(stats.requests, 1),
      }))
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, limit);
  }

  getCostAnalysis(appId?: string): { totalCost: number; breakdown: Record<string, number> } {
    const filteredRecords = appId ? this.records.filter((r) => r.appId === appId) : this.records;
    const totalRequests = filteredRecords.reduce((sum, r) => sum + r.requestCount, 0);

    const breakdown: Record<string, number> = {};
    for (const record of filteredRecords) {
      const key = record.endpoint;
      if (!breakdown[key]) breakdown[key] = 0;
      breakdown[key] += record.requestCount * this.costPerRequest;
    }

    return {
      totalCost: totalRequests * this.costPerRequest,
      breakdown,
    };
  }

  generateReport(appId: string, format: "json" | "csv" = "json"): string {
    const stats = this.getAppUsageStats(appId, "month");
    if (!stats) return "No data available";

    if (format === "json") {
      return JSON.stringify(stats, null, 2);
    } else {
      let csv = "Period,Requests,Errors,Error Rate,Avg Latency\n";
      csv += `${stats.period},${stats.totalRequests},${stats.totalErrors},${stats.errorRate},${stats.avgLatency}\n`;
      return csv;
    }
  }
}

export { UsageAnalytics, type UsageRecord, type AppUsageStats, type EndpointUsage };
