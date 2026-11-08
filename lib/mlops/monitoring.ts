/**
 * MLOps Monitoring Engine
 * - Model drift detection
 * - Performance degradation alerts
 * - Metric tracking
 */

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/error";

export interface DriftDetectionConfig {
  modelVersionId: string;
  featureIds: string[];
  driftThreshold: number; // 0-1, how much deviation triggers alert
  checkIntervalHours: number;
  method: "kl_divergence" | "wasserstein" | "kolmogorov_smirnov";
}

export interface PerformanceAlert {
  versionId: string;
  metric: string;
  threshold: number;
  operator: ">" | "<";
  checkFrequencyMinutes: number;
}

export interface ModelMetric {
  versionId: string;
  metricName: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

/**
 * Record model predictions for monitoring
 */
export async function recordPrediction(
  versionId: string,
  entityId: string,
  prediction: number,
  actual?: number,
  latencyMs?: number
): Promise<{ predictionId: string }> {
  const version = await prisma.modelVersion.findUnique({
    where: { id: versionId },
  });

  if (!version) {
    throw AppError.notFound("Model version not found");
  }

  let error: number | null = null;
  if (actual !== undefined) {
    error = Math.abs(prediction - actual);
  }

  const predictionRecord = await prisma.prediction.create({
    data: {
      modelVersionId: versionId,
      entityId,
      prediction,
      actual: actual ?? null,
      error: error ?? null,
      latencyMs: latencyMs ?? null,
      timestamp: new Date(),
      featureId: "monitoring", // placeholder
    },
  });

  return { predictionId: predictionRecord.id };
}

/**
 * Detect data drift in model features
 */
export async function detectDrift(
  config: DriftDetectionConfig
): Promise<{
  driftDetected: boolean;
  driftScores: Record<string, number>;
  alerts: string[];
}> {
  const version = await prisma.modelVersion.findUnique({
    where: { id: config.modelVersionId },
  });

  if (!version) {
    throw AppError.notFound("Model version not found");
  }

  const driftScores: Record<string, number> = {};
  const alerts: string[] = [];

  // Get baseline metrics from training
  const baselineMetrics = (version.metrics as Record<string, number>) ?? {};

  // Calculate current feature statistics
  for (const featureId of config.featureIds) {
    const predictions = await prisma.prediction.findMany({
      where: { featureId },
      select: { value: true },
      orderBy: { timestamp: "desc" },
      take: 1000,
    });

    const currentValues = predictions
      .map((p) => {
        try {
          const parsed = JSON.parse(p.value);
          return typeof parsed === "number" ? parsed : null;
        } catch {
          return null;
        }
      })
      .filter((v): v is number => v !== null);

    if (currentValues.length === 0) {
      driftScores[featureId] = 0;
      continue;
    }

    // Simple drift detection using coefficient of variation
    const mean =
      currentValues.reduce((a, b) => a + b, 0) / currentValues.length;
    const variance =
      currentValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
      currentValues.length;
    const cv = Math.sqrt(variance) / (Math.abs(mean) + 1e-10);

    driftScores[featureId] = Math.min(cv, 1.0);

    if (driftScores[featureId] > config.driftThreshold) {
      alerts.push(
        `Drift detected in feature ${featureId}: score ${(driftScores[featureId] * 100).toFixed(1)}%`
      );
    }
  }

  const driftDetected = alerts.length > 0;

  // Record drift detection event
  if (driftDetected) {
    await prisma.modelMetric.create({
      data: {
        modelVersionId: config.modelVersionId,
        metricName: "data_drift",
        metricValue: Math.max(...Object.values(driftScores)),
        recordedAt: new Date(),
        metadata: driftScores as Record<string, unknown>,
      },
    });
  }

  return { driftDetected, driftScores, alerts };
}

/**
 * Check for performance degradation
 */
export async function checkPerformanceDegradation(
  versionId: string,
  timeWindowHours: number = 24
): Promise<{
  degraded: boolean;
  currentMetrics: Record<string, number>;
  baselineMetrics: Record<string, number>;
  degradationFactors: string[];
}> {
  const version = await prisma.modelVersion.findUnique({
    where: { id: versionId },
    include: {
      trainingRun: true,
    },
  });

  if (!version) {
    throw AppError.notFound("Model version not found");
  }

  const sinceTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);

  const recentPredictions = await prisma.prediction.findMany({
    where: {
      modelVersionId: versionId,
      timestamp: { gte: sinceTime },
    },
  });

  if (recentPredictions.length === 0) {
    return {
      degraded: false,
      currentMetrics: {},
      baselineMetrics: (version.metrics as Record<string, number>) ?? {},
      degradationFactors: [],
    };
  }

  // Calculate current metrics
  const withErrors = recentPredictions.filter((p) => p.error !== null);
  const currentMetrics: Record<string, number> = {};

  if (withErrors.length > 0) {
    const errors = withErrors.map((p) => p.error ?? 0);
    currentMetrics.mae =
      errors.reduce((a, b) => a + b, 0) / errors.length;
    currentMetrics.rmse = Math.sqrt(
      errors.reduce((sum, e) => sum + Math.pow(e, 2), 0) / errors.length
    );
  }

  const avgLatency =
    recentPredictions.reduce((sum, p) => sum + (p.latencyMs ?? 0), 0) /
    recentPredictions.length;
  currentMetrics.latency_ms = avgLatency;

  // Compare with baseline
  const baselineMetrics = (version.metrics as Record<string, number>) ?? {};
  const degradationFactors: string[] = [];

  // Allow 10% degradation threshold
  const threshold = 1.1;

  if (
    baselineMetrics.accuracy &&
    currentMetrics.mae &&
    currentMetrics.mae > baselineMetrics.accuracy * threshold
  ) {
    degradationFactors.push(
      `Error rate increased from ${baselineMetrics.accuracy?.toFixed(3)} to ${currentMetrics.mae.toFixed(3)}`
    );
  }

  if (
    baselineMetrics.latency_ms &&
    currentMetrics.latency_ms > baselineMetrics.latency_ms * threshold
  ) {
    degradationFactors.push(
      `Latency increased from ${baselineMetrics.latency_ms?.toFixed(0)}ms to ${currentMetrics.latency_ms.toFixed(0)}ms`
    );
  }

  const degraded = degradationFactors.length > 0;

  return {
    degraded,
    currentMetrics,
    baselineMetrics,
    degradationFactors,
  };
}

/**
 * Record model metric
 */
export async function recordModelMetric(
  metric: ModelMetric
): Promise<{ metricId: string }> {
  const version = await prisma.modelVersion.findUnique({
    where: { id: metric.versionId },
  });

  if (!version) {
    throw AppError.notFound("Model version not found");
  }

  const recorded = await prisma.modelMetric.create({
    data: {
      modelVersionId: metric.versionId,
      metricName: metric.metricName,
      metricValue: metric.value,
      recordedAt: metric.timestamp,
      metadata: (metric.tags as Record<string, unknown>) ?? {},
    },
  });

  return { metricId: recorded.id };
}

/**
 * Get model metrics over time
 */
export async function getModelMetricsTimeseries(
  versionId: string,
  metricName: string,
  hoursBack: number = 24
) {
  const sinceTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const metrics = await prisma.modelMetric.findMany({
    where: {
      modelVersionId: versionId,
      metricName,
      recordedAt: { gte: sinceTime },
    },
    orderBy: { recordedAt: "asc" },
    select: {
      recordedAt: true,
      metricValue: true,
    },
  });

  return metrics.map((m) => ({
    timestamp: m.recordedAt,
    value: m.metricValue,
  }));
}

/**
 * Setup performance alert
 */
export async function setupPerformanceAlert(
  alert: PerformanceAlert
): Promise<{ alertId: string }> {
  const version = await prisma.modelVersion.findUnique({
    where: { id: alert.versionId },
  });

  if (!version) {
    throw AppError.notFound("Model version not found");
  }

  const alertId = `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Store alert configuration
  // In production, this would be persisted and periodically evaluated

  return { alertId };
}

/**
 * Get model health summary
 */
export async function getModelHealthSummary(versionId: string) {
  const version = await prisma.modelVersion.findUnique({
    where: { id: versionId },
    include: {
      predictions: {
        orderBy: { timestamp: "desc" },
        take: 100,
        select: {
          prediction: true,
          actual: true,
          error: true,
          latencyMs: true,
          timestamp: true,
        },
      },
    },
  });

  if (!version) {
    throw AppError.notFound("Model version not found");
  }

  const predictions = version.predictions;

  if (predictions.length === 0) {
    return {
      versionId,
      status: "no_data",
      totalPredictions: 0,
    };
  }

  const withErrors = predictions.filter((p) => p.error !== null);
  const errors = withErrors.map((p) => p.error ?? 0);

  const status =
    errors.length === 0 ? "healthy" : errors.length / predictions.length > 0.1
      ? "degraded"
      : "healthy";

  const avgLatency =
    predictions.reduce((sum, p) => sum + (p.latencyMs ?? 0), 0) /
    predictions.length;

  return {
    versionId,
    version: version.version,
    status,
    totalPredictions: predictions.length,
    mae: errors.length > 0 ? errors.reduce((a, b) => a + b, 0) / errors.length : 0,
    errorRate: errors.length / predictions.length,
    avgLatencyMs: avgLatency,
    p95LatencyMs:
      predictions.length > 0
        ? predictions
            .sort((a, b) => (b.latencyMs ?? 0) - (a.latencyMs ?? 0))[
              Math.floor(predictions.length * 0.05)
            ]?.latencyMs ?? 0
        : 0,
  };
}
