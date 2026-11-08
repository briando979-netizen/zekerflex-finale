import { prisma } from "@/lib/prisma";
import { AuditLogger } from "@/lib/audit";

export interface SlaThreshold {
  targetValue: number;
  unit: "hours" | "days" | "percent";
  warningLevel: number;
}

export interface SlaStatus {
  metricId: string;
  metricType: string;
  currentValue: number;
  targetValue: number;
  status: "healthy" | "warning" | "breached";
  percentageOfTarget: number;
  breachCount: number;
  lastBreach?: Date;
}

/**
 * Maak een nieuwe SLA-metric voor een tenant
 */
export async function createSlaMetric(
  tenantId: string,
  metricType: string,
  targetValue: number,
  unit: string = "hours",
  warningLevel?: number
) {
  const calculatedWarning = warningLevel ?? targetValue * 0.8;

  const metric = await prisma.slaMetric.create({
    data: {
      tenantId,
      metricType,
      targetValue,
      unit,
      warningLevel: calculatedWarning,
      status: "healthy",
    },
  });

  await AuditLogger.log({
    userId: "system",
    action: "CREATE",
    resource: "SlaMetric",
    resourceId: metric.id,
    status: "SUCCESS",
    metadata: { tenantId, metricType, targetValue },
  });

  return metric;
}

/**
 * Update SLA-metric waarde en check voor breaches
 */
export async function updateSlaValue(
  metricId: string,
  currentValue: number,
  tenantId: string
) {
  const metric = await prisma.slaMetric.findUnique({
    where: { id: metricId },
  });

  if (!metric) {
    throw new Error("SLA Metric niet gevonden");
  }

  let newStatus: "healthy" | "warning" | "breached" = "healthy";
  let breachOccurred = false;

  const percentageOfTarget = (currentValue / metric.targetValue) * 100;

  if (percentageOfTarget >= 100) {
    newStatus = "breached";
    breachOccurred = true;
  } else if (percentageOfTarget >= metric.warningLevel / metric.targetValue * 100) {
    newStatus = "warning";
  }

  // Update metric met nieuwe waarde
  const updated = await prisma.slaMetric.update({
    where: { id: metricId },
    data: {
      currentValue,
      status: newStatus,
      breachCount: breachOccurred ? metric.breachCount + 1 : metric.breachCount,
      lastBreach: breachOccurred ? new Date() : metric.lastBreach,
      breachDetails: breachOccurred
        ? {
            ...((metric.breachDetails as Record<string, unknown>) ?? {}),
            [new Date().toISOString()]: {
              value: currentValue,
              target: metric.targetValue,
              percentageOfTarget,
            },
          }
        : metric.breachDetails,
    },
  });

  // Log de update
  await AuditLogger.log({
    userId: "system",
    action: "UPDATE",
    resource: "SlaMetric",
    resourceId: metricId,
    status: "SUCCESS",
    metadata: {
      tenantId,
      previousStatus: metric.status,
      newStatus,
      breached: breachOccurred,
      currentValue,
      targetValue: metric.targetValue,
    },
  });

  return updated;
}

/**
 * Controleer SLA-status en retourneer dashboard-info
 */
export async function getSlaStatus(metricId: string): Promise<SlaStatus> {
  const metric = await prisma.slaMetric.findUnique({
    where: { id: metricId },
  });

  if (!metric) {
    throw new Error("SLA Metric niet gevonden");
  }

  const percentageOfTarget = (metric.currentValue / metric.targetValue) * 100;

  return {
    metricId: metric.id,
    metricType: metric.metricType,
    currentValue: metric.currentValue,
    targetValue: metric.targetValue,
    status: metric.status as "healthy" | "warning" | "breached",
    percentageOfTarget,
    breachCount: metric.breachCount,
    lastBreach: metric.lastBreach ?? undefined,
  };
}

/**
 * Haal alle SLA-metrics op voor een tenant
 */
export async function getTenantSlaMetrics(tenantId: string) {
  const metrics = await prisma.slaMetric.findMany({
    where: { tenantId, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  return metrics.map((m) => ({
    ...m,
    percentageOfTarget: (m.currentValue / m.targetValue) * 100,
  }));
}

/**
 * Detecteer SLA-breaches en trigger alerts
 */
export async function detectSlaBreaches(tenantId: string) {
  const metrics = await prisma.slaMetric.findMany({
    where: {
      tenantId,
      isActive: true,
      status: { in: ["warning", "breached"] },
    },
  });

  const breaches = metrics.filter((m) => m.status === "breached");

  if (breaches.length > 0) {
    await AuditLogger.log({
      userId: "system",
      action: "ALERT",
      resource: "SlaMetric",
      resourceId: tenantId,
      status: "SUCCESS",
      metadata: {
        tenantId,
        breachCount: breaches.length,
        breachedMetrics: breaches.map((m) => ({
          type: m.metricType,
          value: m.currentValue,
          target: m.targetValue,
        })),
      },
    });
  }

  return {
    warningCount: metrics.filter((m) => m.status === "warning").length,
    breachCount: breaches.length,
    metrics: breaches,
  };
}

/**
 * Herstel SLA-status na afloop van probleem
 */
export async function clearSlaWarning(metricId: string) {
  const metric = await prisma.slaMetric.findUnique({
    where: { id: metricId },
  });

  if (!metric) {
    throw new Error("SLA Metric niet gevonden");
  }

  // Reset naar "healthy" als waarde nu onder drempel is
  const updated = await prisma.slaMetric.update({
    where: { id: metricId },
    data: {
      status: "healthy",
      currentValue: 0,
    },
  });

  await AuditLogger.log({
    userId: "system",
    action: "UPDATE",
    resource: "SlaMetric",
    resourceId: metricId,
    status: "SUCCESS",
    metadata: { cleared: true },
  });

  return updated;
}

/**
 * Genereer SLA-compliance rapport
 */
export async function generateSlaReport(
  tenantId: string,
  startDate: Date,
  endDate: Date
) {
  const metrics = await prisma.slaMetric.findMany({
    where: { tenantId },
  });

  const complianceRate =
    metrics.length > 0
      ? ((metrics.length -
          metrics.filter((m) => m.status === "breached").length) /
          metrics.length) *
        100
      : 100;

  return {
    tenantId,
    period: { startDate, endDate },
    totalMetrics: metrics.length,
    healthyMetrics: metrics.filter((m) => m.status === "healthy").length,
    warningMetrics: metrics.filter((m) => m.status === "warning").length,
    breachedMetrics: metrics.filter((m) => m.status === "breached").length,
    complianceRate: parseFloat(complianceRate.toFixed(2)),
    metrics: metrics.map((m) => ({
      type: m.metricType,
      currentValue: m.currentValue,
      targetValue: m.targetValue,
      status: m.status,
      breachCount: m.breachCount,
    })),
  };
}

/**
 * Deactiveer SLA-metric
 */
export async function deactivateSlaMetric(metricId: string) {
  return await prisma.slaMetric.update({
    where: { id: metricId },
    data: { isActive: false },
  });
}
