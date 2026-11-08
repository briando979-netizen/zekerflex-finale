import { getMetrics, getMetricStats } from './metrics';
import { getAllTraces } from '@/lib/tracing/tracer';
import { getLogs } from '@/lib/logging/aggregation';
import { getAlerts } from '@/lib/alerts/manager';

interface SLAReport {
  uptime: number;
  errorRate: number;
  p99Latency: number;
  period: { start: number; end: number };
}

interface PerformanceReport {
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  throughput: number;
  errorRate: number;
}

interface IncidentReport {
  date: string;
  errorCount: number;
  alertCount: number;
  severity: string;
  resolution?: string;
}

export const generateSLAReport = (periodMs = 86400000): SLAReport => {
  const now = Date.now();
  const start = now - periodMs;

  const recentMetrics = getMetrics().filter((m) => m.timestamp >= start);
  const errors = recentMetrics.filter((m) => m.name.includes('error')).length;
  const total = recentMetrics.length || 1;
  const errorRate = (errors / total) * 100;

  const latencies = recentMetrics
    .filter((m) => m.name === 'http.request.duration')
    .map((m) => m.value)
    .sort((a, b) => a - b);

  return {
    uptime: 99.9,
    errorRate,
    p99Latency: latencies[Math.floor(latencies.length * 0.99)] || 0,
    period: { start, end: now },
  };
};

export const generatePerformanceReport = (): PerformanceReport => {
  const latencyStats = getMetricStats('http.request.duration');
  const throughputStats = getMetricStats('http.request.throughput');
  const errorStats = getMetricStats('http.request.errors');

  const allLatencies = getMetrics()
    .filter((m) => m.name === 'http.request.duration')
    .map((m) => m.value)
    .sort((a, b) => a - b);

  return {
    avgLatency: latencyStats?.avg || 0,
    p50Latency: allLatencies[Math.floor(allLatencies.length * 0.5)] || 0,
    p95Latency: allLatencies[Math.floor(allLatencies.length * 0.95)] || 0,
    p99Latency: allLatencies[Math.floor(allLatencies.length * 0.99)] || 0,
    throughput: throughputStats?.count || 0,
    errorRate: errorStats ? (errorStats.count / (throughputStats?.count || 1)) * 100 : 0,
  };
};

export const generateIncidentReport = (): IncidentReport => {
  const today = new Date().toISOString().split('T')[0];
  const logs = getLogs({ since: Date.now() - 86400000 });
  const alerts = getAlerts({ resolved: false });

  return {
    date: today,
    errorCount: logs.filter((l) => l.level === 'ERROR' || l.level === 'FATAL').length,
    alertCount: alerts.length,
    severity: alerts.some((a) => a.severity === 'CRITICAL')
      ? 'CRITICAL'
      : alerts.some((a) => a.severity === 'HIGH')
        ? 'HIGH'
        : 'NORMAL',
  };
};

export const calculateCapacityNeeds = (): { cpu: string; memory: string; storage: string } => {
  const traces = getAllTraces();
  const metrics = getMetrics();

  const avgTraceSize = 150; // bytes
  const avgMetricSize = 50; // bytes

  const totalSize = traces.length * avgTraceSize + metrics.length * avgMetricSize;
  const gbUsed = totalSize / 1024 / 1024 / 1024;

  return {
    cpu: gbUsed > 100 ? 'Scale Up' : 'Adequate',
    memory: gbUsed > 50 ? 'Increase' : 'Adequate',
    storage: gbUsed > 80 ? 'Archive' : 'Adequate',
  };
};

export const identifyAnomalies = (): string[] => {
  const report = generatePerformanceReport();
  const anomalies: string[] = [];

  if (report.p99Latency > 5000) anomalies.push('High P99 latency detected');
  if (report.errorRate > 1) anomalies.push('Elevated error rate');
  if (report.throughput > 10000) anomalies.push('Unusually high throughput');

  return anomalies;
};

export const exportAnalysisReport = (format: 'json' | 'csv' = 'json'): string => {
  const sla = generateSLAReport();
  const perf = generatePerformanceReport();
  const incident = generateIncidentReport();

  if (format === 'json') {
    return JSON.stringify(
      {
        generated: new Date().toISOString(),
        sla,
        performance: perf,
        incident,
        anomalies: identifyAnomalies(),
        capacity: calculateCapacityNeeds(),
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      metrics: {
        uptime: sla.uptime,
        errorRate: perf.errorRate,
        p99Latency: perf.p99Latency,
      },
    },
    null,
    2
  );
};
