export interface SLATarget {
  id: string;
  name: string;
  uptime: number;
  deploymentSuccessRate: number;
  maxBuildTime: number;
  maxTestTime: number;
  responseTime: number;
  createdAt: Date;
}

export interface SLAMetrics {
  period: string;
  uptime: number;
  deploymentSuccessRate: number;
  avgBuildTime: number;
  avgTestTime: number;
  avgResponseTime: number;
  breaches: number;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "critical";
  uptime: number;
  responseTime: number;
  lastCheck: Date;
  incidents: number;
}

const targets: Map<string, SLATarget> = new Map();
const metrics: SLAMetrics[] = [];
const healthHistory: HealthStatus[] = [];

export function setSLATarget(
  name: string,
  uptime: number = 99.9,
  deploymentSuccessRate: number = 95,
  maxBuildTime: number = 300000,
  maxTestTime: number = 300000,
  responseTime: number = 2000
): SLATarget {
  const id = `sla-${Date.now()}`;

  const target: SLATarget = {
    id,
    name,
    uptime,
    deploymentSuccessRate,
    maxBuildTime,
    maxTestTime,
    responseTime,
    createdAt: new Date(),
  };

  targets.set(id, target);
  return target;
}

export function getSLATarget(id: string): SLATarget | null {
  return targets.get(id) || null;
}

export function getCurrentSLATarget(): SLATarget | null {
  const values = Array.from(targets.values());
  return values.length > 0 ? values[values.length - 1] : null;
}

export function recordSLAMetrics(
  period: string,
  uptime: number,
  deploymentSuccessRate: number,
  avgBuildTime: number,
  avgTestTime: number,
  avgResponseTime: number
): SLAMetrics {
  const target = getCurrentSLATarget();
  let breaches = 0;

  if (target) {
    if (uptime < target.uptime) breaches++;
    if (deploymentSuccessRate < target.deploymentSuccessRate) breaches++;
    if (avgBuildTime > target.maxBuildTime) breaches++;
    if (avgTestTime > target.maxTestTime) breaches++;
    if (avgResponseTime > target.responseTime) breaches++;
  }

  const metric: SLAMetrics = {
    period,
    uptime,
    deploymentSuccessRate,
    avgBuildTime,
    avgTestTime,
    avgResponseTime,
    breaches,
  };

  metrics.push(metric);
  return metric;
}

export function recordHealthStatus(status: "healthy" | "degraded" | "critical", uptime: number, responseTime: number, incidents: number): HealthStatus {
  const health: HealthStatus = {
    status,
    uptime,
    responseTime,
    lastCheck: new Date(),
    incidents,
  };

  healthHistory.push(health);

  if (healthHistory.length > 1000) {
    healthHistory.shift();
  }

  return health;
}

export function getHealthStatus(): HealthStatus | null {
  return healthHistory.length > 0 ? healthHistory[healthHistory.length - 1] : null;
}

export function getHealthTrend(hours: number = 24): HealthStatus[] {
  const cutoff = new Date(Date.now() - hours * 3600000);
  return healthHistory.filter(h => h.lastCheck >= cutoff);
}

export function getSLAMetrics(limit: number = 30): SLAMetrics[] {
  return metrics.slice(-limit);
}

export function checkSLACompliance(): {
  compliant: boolean;
  breaches: string[];
  percentage: number;
} {
  const target = getCurrentSLATarget();
  if (!target || metrics.length === 0) {
    return { compliant: true, breaches: [], percentage: 100 };
  }

  const recent = metrics.slice(-30);
  const breaches: string[] = [];

  const avgUptime = recent.reduce((sum, m) => sum + m.uptime, 0) / recent.length;
  if (avgUptime < target.uptime) {
    breaches.push(`Uptime: ${avgUptime.toFixed(2)}% (target: ${target.uptime}%)`);
  }

  const avgSuccess = recent.reduce((sum, m) => sum + m.deploymentSuccessRate, 0) / recent.length;
  if (avgSuccess < target.deploymentSuccessRate) {
    breaches.push(`Success Rate: ${avgSuccess.toFixed(2)}% (target: ${target.deploymentSuccessRate}%)`);
  }

  const avgBuild = recent.reduce((sum, m) => sum + m.avgBuildTime, 0) / recent.length;
  if (avgBuild > target.maxBuildTime) {
    breaches.push(`Build Time: ${avgBuild.toFixed(0)}ms (target: ${target.maxBuildTime}ms)`);
  }

  const compliant = breaches.length === 0;
  const percentage = (1 - breaches.length / 5) * 100;

  return { compliant, breaches, percentage };
}

export function getSLAStats() {
  const compliance = checkSLACompliance();
  const currentHealth = getHealthStatus();

  return {
    compliant: compliance.compliant,
    compliancePercentage: compliance.percentage,
    breaches: compliance.breaches,
    currentHealth: currentHealth?.status || "unknown",
    uptime: currentHealth?.uptime || 0,
    responseTime: currentHealth?.responseTime || 0,
    metricsRecorded: metrics.length,
  };
}
