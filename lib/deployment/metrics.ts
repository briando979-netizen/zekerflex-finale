export interface PerformanceMetrics {
  buildTime: number;
  testTime: number;
  bundleSize: number;
  coreWebVitals: {
    lcp: number;
    fid: number;
    cls: number;
  };
  errorRate: number;
  uptime: number;
  timestamp: Date;
}

export interface TestMetrics {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  coverage: number;
  duration: number;
  timestamp: Date;
}

const metricsHistory: PerformanceMetrics[] = [];
const testHistory: TestMetrics[] = [];

export function recordPerformanceMetrics(metrics: PerformanceMetrics): void {
  metricsHistory.push(metrics);
  if (metricsHistory.length > 100) {
    metricsHistory.shift();
  }
}

export function recordTestMetrics(metrics: TestMetrics): void {
  testHistory.push(metrics);
  if (testHistory.length > 100) {
    testHistory.shift();
  }
}

export function getPerformanceMetrics(): PerformanceMetrics[] {
  return [...metricsHistory];
}

export function getTestMetrics(): TestMetrics[] {
  return [...testHistory];
}

export function calculateMetricsAverage(metrics: PerformanceMetrics[]): Partial<PerformanceMetrics> {
  if (metrics.length === 0) return {};

  const avg = {
    buildTime: metrics.reduce((sum, m) => sum + m.buildTime, 0) / metrics.length,
    testTime: metrics.reduce((sum, m) => sum + m.testTime, 0) / metrics.length,
    bundleSize: metrics.reduce((sum, m) => sum + m.bundleSize, 0) / metrics.length,
    errorRate: metrics.reduce((sum, m) => sum + m.errorRate, 0) / metrics.length,
    uptime: metrics.reduce((sum, m) => sum + m.uptime, 0) / metrics.length,
  };

  return avg;
}

export function detectPerformanceRegression(
  current: PerformanceMetrics,
  threshold: number = 0.1
): string[] {
  const issues: string[] = [];
  const average = calculateMetricsAverage(metricsHistory.slice(-10));

  if (average.buildTime && current.buildTime > average.buildTime * (1 + threshold)) {
    issues.push(`Build time increased: ${current.buildTime}ms vs ${average.buildTime}ms avg`);
  }

  if (average.bundleSize && current.bundleSize > average.bundleSize * (1 + threshold)) {
    issues.push(`Bundle size increased: ${current.bundleSize}bytes vs ${average.bundleSize}bytes avg`);
  }

  return issues;
}

export function getTestSuccessRate(metrics: TestMetrics[]): number {
  if (metrics.length === 0) return 0;
  const recent = metrics.slice(-10);
  const totalPassed = recent.reduce((sum, m) => sum + m.passedTests, 0);
  const totalTests = recent.reduce((sum, m) => sum + m.totalTests, 0);
  return totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;
}
