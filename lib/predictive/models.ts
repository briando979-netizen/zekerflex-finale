/**
 * Model Management
 *
 * Training pipeline, model versioning, A/B testing, performance monitoring,
 * and automated retraining.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { ModelStatus, TrainingStatus, ModelType } from "@prisma/client";

// ---------------------------------------------------------------------------
// Model Management Types
// ---------------------------------------------------------------------------

export interface ModelTrainingConfig {
  modelId: string;
  dataSize: number;
  trainTestSplit: number; // 0.8 = 80% train, 20% test
  validationSplit: number; // 0.1 = 10% validation
  hyperparameters: Record<string, unknown>;
  features: string[];
  targetVariable: string;
  maxIterations: number;
}

export interface TrainingMetrics {
  trainAccuracy: number;
  testAccuracy: number;
  validationAccuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  auc?: number;
  rmse?: number; // For regression
  mae?: number;
  trainingTime: number; // seconds
  convergenceEpoch?: number;
}

export interface ABTestConfig {
  modelIdA: string;
  modelIdB: string;
  trafficSplit: number; // 0.5 = 50/50 split
  duration: number; // days
  successMetric: "accuracy" | "precision" | "recall" | "f1" | "rmse";
  minSampleSize: number;
}

export interface ABTestResult {
  testId: string;
  modelIdA: string;
  modelIdB: string;
  winner?: string;
  winnerScore: number;
  loserScore: number;
  improvement: number; // percentage
  statisticallySignificant: boolean;
  pValue: number;
  duration: number; // seconds
}

// ---------------------------------------------------------------------------
// Training Pipeline
// ---------------------------------------------------------------------------

/**
 * Create and initialize a new model
 */
export async function createModel(config: {
  tenantId?: string;
  name: string;
  type: ModelType;
  hyperparameters: Record<string, unknown>;
  featureSet: string[];
}): Promise<string> {
  try {
    const model = await prisma.predictionModel.create({
      data: {
        name: config.name,
        type: config.type,
        status: ModelStatus.TRAINING,
        version: 1,
        hyperparameters: config.hyperparameters,
        featureSet: config.featureSet,
        modelPath: `models/${config.name}-v1-${Date.now()}`,
        tenantId: config.tenantId,
      },
    });

    logger.info("Model created", { modelId: model.id, name: config.name });
    return model.id;
  } catch (err) {
    logger.error("Model creation failed", { error: err });
    throw AppError.internal("Model creation failed");
  }
}

/**
 * Start a training run
 */
export async function startTrainingRun(
  modelId: string,
  config: ModelTrainingConfig
): Promise<string> {
  try {
    const model = await prisma.predictionModel.findUnique({
      where: { id: modelId },
    });

    if (!model) {
      throw AppError.notFound("Model not found");
    }

    const trainingRun = await prisma.trainingRun.create({
      data: {
        modelId,
        version: model.version,
        status: TrainingStatus.IN_PROGRESS,
        startedAt: new Date(),
        parameters: config.hyperparameters,
      },
    });

    await prisma.predictionModel.update({
      where: { id: modelId },
      data: {
        status: ModelStatus.TRAINING,
        trainingStartedAt: new Date(),
      },
    });

    logger.info("Training run started", {
      runId: trainingRun.id,
      modelId,
    });

    return trainingRun.id;
  } catch (err) {
    logger.error("Training run start failed", { error: err });
    throw AppError.internal("Training run start failed");
  }
}

/**
 * Complete a training run with metrics
 */
export async function completeTrainingRun(
  trainingRunId: string,
  metrics: TrainingMetrics
): Promise<void> {
  try {
    const trainingRun = await prisma.trainingRun.findUnique({
      where: { id: trainingRunId },
    });

    if (!trainingRun) {
      throw AppError.notFound("Training run not found");
    }

    await prisma.trainingRun.update({
      where: { id: trainingRunId },
      data: {
        status: TrainingStatus.COMPLETED,
        completedAt: new Date(),
        duration: metrics.trainingTime,
        trainAccuracy: metrics.trainAccuracy,
        testAccuracy: metrics.testAccuracy,
        validationAccuracy: metrics.validationAccuracy,
      },
    });

    // Update model with metrics
    await prisma.predictionModel.update({
      where: { id: trainingRun.modelId },
      data: {
        status: ModelStatus.ACTIVE,
        accuracy: metrics.testAccuracy,
        precision: metrics.precision,
        recall: metrics.recall,
        f1Score: metrics.f1Score,
        rmse: metrics.rmse,
        mae: metrics.mae,
        trainingCompletedAt: new Date(),
      },
    });

    logger.info("Training run completed", {
      runId: trainingRunId,
      testAccuracy: metrics.testAccuracy,
    });
  } catch (err) {
    logger.error("Training run completion failed", { error: err });
    throw AppError.internal("Training run completion failed");
  }
}

/**
 * Mark training run as failed
 */
export async function failTrainingRun(
  trainingRunId: string,
  error: string
): Promise<void> {
  try {
    const trainingRun = await prisma.trainingRun.findUnique({
      where: { id: trainingRunId },
    });

    if (!trainingRun) {
      throw AppError.notFound("Training run not found");
    }

    await prisma.trainingRun.update({
      where: { id: trainingRunId },
      data: {
        status: TrainingStatus.FAILED,
        errorMessage: error,
        completedAt: new Date(),
      },
    });

    await prisma.predictionModel.update({
      where: { id: trainingRun.modelId },
      data: {
        status: ModelStatus.FAILED,
      },
    });

    logger.error("Training run failed", {
      runId: trainingRunId,
      error,
    });
  } catch (err) {
    logger.error("Training run failure recording failed", { error: err });
    throw AppError.internal("Training run failure recording failed");
  }
}

// ---------------------------------------------------------------------------
// Model Versioning
// ---------------------------------------------------------------------------

/**
 * Promote a model version to production
 */
export async function promoteModel(
  modelId: string,
  version: number
): Promise<void> {
  try {
    const model = await prisma.predictionModel.findUnique({
      where: { id: modelId },
    });

    if (!model) {
      throw AppError.notFound("Model not found");
    }

    if (model.version !== version) {
      throw AppError.validation("Invalid model version");
    }

    await prisma.predictionModel.update({
      where: { id: modelId },
      data: {
        status: ModelStatus.ACTIVE,
        deployedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });

    logger.info("Model promoted", {
      modelId,
      version,
    });
  } catch (err) {
    logger.error("Model promotion failed", { error: err });
    throw AppError.internal("Model promotion failed");
  }
}

/**
 * Archive a model
 */
export async function archiveModel(modelId: string): Promise<void> {
  try {
    await prisma.predictionModel.update({
      where: { id: modelId },
      data: {
        status: ModelStatus.ARCHIVED,
      },
    });

    logger.info("Model archived", { modelId });
  } catch (err) {
    logger.error("Model archiving failed", { error: err });
    throw AppError.internal("Model archiving failed");
  }
}

/**
 * Get model by ID with full context
 */
export async function getModel(modelId: string) {
  try {
    const model = await prisma.predictionModel.findUnique({
      where: { id: modelId },
      include: {
        trainingRuns: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        metrics: {
          orderBy: { period: "desc" },
          take: 30,
        },
      },
    });

    if (!model) {
      throw AppError.notFound("Model not found");
    }

    return model;
  } catch (err) {
    logger.error("Model retrieval failed", { error: err });
    throw AppError.internal("Model retrieval failed");
  }
}

// ---------------------------------------------------------------------------
// Performance Monitoring
// ---------------------------------------------------------------------------

/**
 * Record model metrics for a period
 */
export async function recordModelMetrics(
  modelId: string,
  metrics: {
    predictionsCount: number;
    correctPredictions: number;
    precision: number;
    recall: number;
    f1Score: number;
    dataDrift?: number;
  }
): Promise<void> {
  try {
    const model = await prisma.predictionModel.findUnique({
      where: { id: modelId },
    });

    if (!model) {
      throw AppError.notFound("Model not found");
    }

    const period = new Date();
    period.setHours(0, 0, 0, 0);

    await prisma.modelMetrics.upsert({
      where: {
        modelId_period: {
          modelId,
          period,
        },
      },
      update: {
        predictionsCount: metrics.predictionsCount,
        correctPredictions: metrics.correctPredictions,
        precision: metrics.precision,
        recall: metrics.recall,
        f1Score: metrics.f1Score,
        dataDrift: metrics.dataDrift,
      },
      create: {
        modelId,
        period,
        predictionsCount: metrics.predictionsCount,
        correctPredictions: metrics.correctPredictions,
        precision: metrics.precision,
        recall: metrics.recall,
        f1Score: metrics.f1Score,
        dataDrift: metrics.dataDrift,
      },
    });

    // Update model lastUsedAt
    await prisma.predictionModel.update({
      where: { id: modelId },
      data: { lastUsedAt: new Date() },
    });

    logger.info("Model metrics recorded", {
      modelId,
      precision: metrics.precision,
    });
  } catch (err) {
    logger.error("Model metrics recording failed", { error: err });
    throw AppError.internal("Model metrics recording failed");
  }
}

/**
 * Detect model drift
 */
export async function detectModelDrift(
  modelId: string,
  threshold: number = 0.05
): Promise<{
  hasDrift: boolean;
  driftScore: number;
  recommendation: string;
}> {
  try {
    const metrics = await prisma.modelMetrics.findMany({
      where: { modelId },
      orderBy: { period: "desc" },
      take: 30,
    });

    if (metrics.length < 7) {
      return {
        hasDrift: false,
        driftScore: 0,
        recommendation: "Insufficient data for drift detection",
      };
    }

    // Compare recent period with baseline
    const recent = metrics.slice(0, 7);
    const baseline = metrics.slice(7, 14);

    const recentAvgF1 =
      recent.reduce((sum, m) => sum + (m.f1Score || 0), 0) /
      recent.length;
    const baselineAvgF1 =
      baseline.reduce((sum, m) => sum + (m.f1Score || 0), 0) /
      baseline.length;

    const driftScore = Math.abs(
      (recentAvgF1 - baselineAvgF1) / (baselineAvgF1 || 1)
    );
    const hasDrift = driftScore > threshold;

    return {
      hasDrift,
      driftScore,
      recommendation: hasDrift
        ? "Model performance has degraded. Consider retraining."
        : "Model performance is stable",
    };
  } catch (err) {
    logger.error("Model drift detection failed", { error: err });
    throw AppError.internal("Model drift detection failed");
  }
}

// ---------------------------------------------------------------------------
// A/B Testing
// ---------------------------------------------------------------------------

/**
 * Initialize A/B test between two models
 */
export async function initializeABTest(
  config: ABTestConfig
): Promise<string> {
  try {
    // Validate models exist
    const [modelA, modelB] = await Promise.all([
      prisma.predictionModel.findUnique({ where: { id: config.modelIdA } }),
      prisma.predictionModel.findUnique({ where: { id: config.modelIdB } }),
    ]);

    if (!modelA || !modelB) {
      throw AppError.validation("One or both models not found");
    }

    if (modelA.status !== ModelStatus.ACTIVE || modelB.status !== ModelStatus.ACTIVE) {
      throw AppError.validation("Both models must be in ACTIVE status");
    }

    const testId = `ab-test-${Date.now()}`;

    logger.info("A/B test initialized", {
      testId,
      modelA: config.modelIdA,
      modelB: config.modelIdB,
      trafficSplit: config.trafficSplit,
    });

    return testId;
  } catch (err) {
    logger.error("A/B test initialization failed", { error: err });
    throw AppError.internal("A/B test initialization failed");
  }
}

/**
 * Assign user to A/B test variant
 */
export function assignABTestVariant(
  userId: string,
  trafficSplit: number = 0.5
): "A" | "B" {
  // Consistent hash-based assignment
  const hash =
    userId
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0) % 100;
  return hash < trafficSplit * 100 ? "A" : "B";
}

/**
 * Analyze A/B test results
 */
export function analyzeABTest(
  resultsA: {
    metric: number;
    count: number;
  },
  resultsB: {
    metric: number;
    count: number;
  },
  config: ABTestConfig
): ABTestResult {
  try {
    const metricsA = resultsA.metric / resultsA.count;
    const metricsB = resultsB.metric / resultsB.count;

    const improvement =
      ((metricsB - metricsA) / (metricsA || 1)) * 100;

    // Simple chi-square test for statistical significance
    const pooledProportion =
      (resultsA.metric + resultsB.metric) /
      (resultsA.count + resultsB.count);
    const standardError = Math.sqrt(
      (pooledProportion * (1 - pooledProportion)) /
        (resultsA.count + resultsB.count)
    );
    const zScore = (metricsB - metricsA) / (standardError || 1);
    const pValue = 1 - Math.abs(zScore) / 3; // Approximate

    const winner = metricsB > metricsA ? "B" : "A";
    const winnerScore = Math.max(metricsA, metricsB);
    const loserScore = Math.min(metricsA, metricsB);

    return {
      testId: `ab-test-${Date.now()}`,
      modelIdA: config.modelIdA,
      modelIdB: config.modelIdB,
      winner: pValue < 0.05 ? winner : undefined,
      winnerScore,
      loserScore,
      improvement: Math.abs(improvement),
      statisticallySignificant: pValue < 0.05,
      pValue,
      duration: 0,
    };
  } catch (err) {
    logger.error("A/B test analysis failed", { error: err });
    throw AppError.internal("A/B test analysis failed");
  }
}

// ---------------------------------------------------------------------------
// Automated Retraining
// ---------------------------------------------------------------------------

/**
 * Determine if model should be retrained
 */
export async function shouldRetrain(modelId: string): Promise<{
  shouldRetrain: boolean;
  reason: string;
}> {
  try {
    const model = await getModel(modelId);

    // Check if model hasn't been retrained recently
    if (model.trainingCompletedAt) {
      const daysSinceTraining = Math.floor(
        (new Date().getTime() -
          model.trainingCompletedAt.getTime()) /
          (1000 * 60 * 60 * 24)
      );

      if (daysSinceTraining > 30) {
        return {
          shouldRetrain: true,
          reason: `No training for ${daysSinceTraining} days`,
        };
      }
    }

    // Check for performance drift
    const drift = await detectModelDrift(modelId);
    if (drift.hasDrift) {
      return {
        shouldRetrain: true,
        reason: `Model drift detected: ${drift.driftScore.toFixed(3)}`,
      };
    }

    // Check accuracy threshold
    if (model.accuracy && model.accuracy < 0.7) {
      return {
        shouldRetrain: true,
        reason: `Accuracy below threshold: ${model.accuracy.toFixed(3)}`,
      };
    }

    return {
      shouldRetrain: false,
      reason: "Model is performing well",
    };
  } catch (err) {
    logger.error("Retraining check failed", { error: err });
    return {
      shouldRetrain: false,
      reason: "Error checking retraining criteria",
    };
  }
}

/**
 * Schedule automatic retraining
 */
export async function scheduleRetraining(
  modelId: string,
  intervalDays: number = 30
): Promise<void> {
  try {
    const nextTraining = new Date();
    nextTraining.setDate(nextTraining.getDate() + intervalDays);

    await prisma.predictionModel.update({
      where: { id: modelId },
      data: {
        nextRetrainingAt: nextTraining,
      },
    });

    logger.info("Retraining scheduled", {
      modelId,
      nextTrainingDate: nextTraining,
    });
  } catch (err) {
    logger.error("Retraining scheduling failed", { error: err });
    throw AppError.internal("Retraining scheduling failed");
  }
}

/**
 * Get models due for retraining
 */
export async function getModelsForRetraining() {
  try {
    return await prisma.predictionModel.findMany({
      where: {
        AND: [
          { status: ModelStatus.ACTIVE },
          {
            nextRetrainingAt: {
              lte: new Date(),
            },
          },
        ],
      },
    });
  } catch (err) {
    logger.error("Failed to fetch models for retraining", { error: err });
    throw AppError.internal("Failed to fetch models for retraining");
  }
}
