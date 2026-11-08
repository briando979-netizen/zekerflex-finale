/**
 * MLOps Deployment Engine
 * - Model serving & endpoints
 * - A/B testing & traffic splitting
 * - Canary releases
 */

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/error";

export interface DeploymentConfig {
  versionId: string;
  endpoint: string;
  replicas: number;
  resourceLimits: {
    cpuCores: number;
    memoryMb: number;
  };
  healthCheckIntervalSeconds: number;
}

export interface ABTestConfig {
  modelVersionIds: [string, string]; // [control, treatment]
  trafficSplitPercentage: [number, number]; // [control%, treatment%]
  durationDays: number;
  successMetric: string;
  successThreshold: number;
}

export interface CanaryReleaseConfig {
  newVersionId: string;
  currentVersionId: string;
  initialCanaryTraffic: number; // percentage
  incrementPercentage: number; // traffic increase per step
  incrementIntervalMinutes: number;
}

/**
 * Deploy a model version to production
 */
export async function deployModel(
  config: DeploymentConfig
): Promise<{ deploymentId: string; endpoint: string }> {
  const version = await prisma.modelVersion.findUnique({
    where: { id: config.versionId },
  });

  if (!version) {
    throw AppError.notFound("Model version not found");
  }

  if (version.status === "rejected") {
    throw AppError.validation("Cannot deploy rejected versions");
  }

  const deployment = await prisma.modelDeployment.create({
    data: {
      modelVersionId: config.versionId,
      endpoint: config.endpoint,
      status: "deploying",
      replicas: config.replicas,
      resourceLimits: config.resourceLimits as unknown as Record<string, unknown>,
      config: config as unknown as Record<string, unknown>,
      deployedAt: new Date(),
    },
  });

  // Update model version status
  await prisma.modelVersion.update({
    where: { id: config.versionId },
    data: { status: "deployed" },
  });

  return {
    deploymentId: deployment.id,
    endpoint: deployment.endpoint,
  };
}

/**
 * Get deployment status
 */
export async function getDeploymentStatus(deploymentId: string) {
  const deployment = await prisma.modelDeployment.findUnique({
    where: { id: deploymentId },
    include: {
      modelVersion: {
        select: { version: true, model: { select: { name: true } } },
      },
    },
  });

  if (!deployment) {
    throw AppError.notFound("Deployment not found");
  }

  return {
    id: deployment.id,
    modelVersion: deployment.modelVersion.version,
    modelName: deployment.modelVersion.model?.name,
    status: deployment.status,
    endpoint: deployment.endpoint,
    replicas: deployment.replicas,
    healthyReplicas: deployment.healthyReplicas ?? 0,
    deployedAt: deployment.deployedAt,
    updatedAt: deployment.updatedAt,
  };
}

/**
 * Start an A/B test between two model versions
 */
export async function startABTest(config: ABTestConfig): Promise<{
  testId: string;
}> {
  const [controlVersion, treatmentVersion] = await Promise.all([
    prisma.modelVersion.findUnique({ where: { id: config.modelVersionIds[0] } }),
    prisma.modelVersion.findUnique({ where: { id: config.modelVersionIds[1] } }),
  ]);

  if (!controlVersion || !treatmentVersion) {
    throw AppError.notFound("One or both model versions not found");
  }

  if (
    config.trafficSplitPercentage[0] +
      config.trafficSplitPercentage[1] !==
    100
  ) {
    throw AppError.validation("Traffic split percentages must sum to 100");
  }

  const test = await prisma.abTest.create({
    data: {
      controlVersionId: config.modelVersionIds[0],
      treatmentVersionId: config.modelVersionIds[1],
      trafficSplitControl: config.trafficSplitPercentage[0],
      trafficSplitTreatment: config.trafficSplitPercentage[1],
      status: "running",
      successMetric: config.successMetric,
      successThreshold: config.successThreshold,
      startedAt: new Date(),
      endAt: new Date(Date.now() + config.durationDays * 24 * 60 * 60 * 1000),
    },
  });

  return { testId: test.id };
}

/**
 * Get A/B test results
 */
export async function getABTestResults(testId: string) {
  const test = await prisma.abTest.findUnique({
    where: { id: testId },
    include: {
      controlVersion: { select: { version: true } },
      treatmentVersion: { select: { version: true } },
    },
  });

  if (!test) {
    throw AppError.notFound("A/B test not found");
  }

  return {
    testId: test.id,
    status: test.status,
    controlVersion: test.controlVersion.version,
    treatmentVersion: test.treatmentVersion.version,
    trafficSplit: [test.trafficSplitControl, test.trafficSplitTreatment],
    successMetric: test.successMetric,
    successThreshold: test.successThreshold,
    controlMetrics: (test.controlMetrics as Record<string, number>) ?? {},
    treatmentMetrics: (test.treatmentMetrics as Record<string, number>) ?? {},
    winner: determineWinner(test, test.successMetric),
    startedAt: test.startedAt,
    endAt: test.endAt,
    samplesCollected: test.samplesCollected ?? 0,
  };
}

/**
 * Record prediction for A/B test
 */
export async function recordABTestPrediction(
  testId: string,
  versionId: string,
  actualValue: number,
  predictedValue: number
): Promise<void> {
  const test = await prisma.abTest.findUnique({
    where: { id: testId },
  });

  if (!test) {
    throw AppError.notFound("A/B test not found");
  }

  const error = Math.abs(actualValue - predictedValue);

  if (versionId === test.controlVersionId) {
    const current = (test.controlMetrics as Record<string, number>) ?? {};
    current.totalError = (current.totalError ?? 0) + error;
    current.predictions = (current.predictions ?? 0) + 1;

    await prisma.abTest.update({
      where: { id: testId },
      data: {
        controlMetrics: current,
      },
    });
  } else if (versionId === test.treatmentVersionId) {
    const current = (test.treatmentMetrics as Record<string, number>) ?? {};
    current.totalError = (current.totalError ?? 0) + error;
    current.predictions = (current.predictions ?? 0) + 1;

    await prisma.abTest.update({
      where: { id: testId },
      data: {
        treatmentMetrics: current,
      },
    });
  }
}

/**
 * Complete an A/B test
 */
export async function completeABTest(testId: string): Promise<{
  winner: string | null;
}> {
  const test = await prisma.abTest.findUnique({
    where: { id: testId },
  });

  if (!test) {
    throw AppError.notFound("A/B test not found");
  }

  const winner = determineWinner(test, test.successMetric);

  await prisma.abTest.update({
    where: { id: testId },
    data: {
      status: "completed",
      completedAt: new Date(),
    },
  });

  return { winner };
}

/**
 * Start a canary release
 */
export async function startCanaryRelease(
  config: CanaryReleaseConfig
): Promise<{ releaseId: string }> {
  const [newVersion, currentVersion] = await Promise.all([
    prisma.modelVersion.findUnique({ where: { id: config.newVersionId } }),
    prisma.modelVersion.findUnique({ where: { id: config.currentVersionId } }),
  ]);

  if (!newVersion || !currentVersion) {
    throw AppError.notFound("One or both model versions not found");
  }

  const release = await prisma.canaryRelease.create({
    data: {
      newVersionId: config.newVersionId,
      currentVersionId: config.currentVersionId,
      status: "in_progress",
      currentCanaryTraffic: config.initialCanaryTraffic,
      targetCanaryTraffic: 100,
      maxCanaryTraffic: 100,
      incrementPercentage: config.incrementPercentage,
      incrementIntervalMinutes: config.incrementIntervalMinutes,
      startedAt: new Date(),
      nextIncrementAt: new Date(
        Date.now() + config.incrementIntervalMinutes * 60 * 1000
      ),
    },
  });

  return { releaseId: release.id };
}

/**
 * Get canary release status
 */
export async function getCanaryStatus(releaseId: string) {
  const release = await prisma.canaryRelease.findUnique({
    where: { id: releaseId },
    include: {
      newVersion: { select: { version: true } },
      currentVersion: { select: { version: true } },
    },
  });

  if (!release) {
    throw AppError.notFound("Canary release not found");
  }

  return {
    releaseId: release.id,
    status: release.status,
    newVersion: release.newVersion.version,
    currentVersion: release.currentVersion.version,
    canaryTraffic: release.currentCanaryTraffic,
    nextIncrementAt: release.nextIncrementAt,
    errorRate: (release.canaryErrorMetrics as Record<string, number>)
      ?.errorRate ?? 0,
    p95Latency: (release.canaryErrorMetrics as Record<string, number>)
      ?.p95Latency ?? 0,
  };
}

/**
 * Complete canary release (promote to stable)
 */
export async function completeCanaryRelease(releaseId: string): Promise<void> {
  const release = await prisma.canaryRelease.findUnique({
    where: { id: releaseId },
  });

  if (!release) {
    throw AppError.notFound("Canary release not found");
  }

  await prisma.canaryRelease.update({
    where: { id: releaseId },
    data: {
      status: "completed",
      completedAt: new Date(),
    },
  });
}

/**
 * Rollback canary release
 */
export async function rollbackCanaryRelease(releaseId: string): Promise<void> {
  const release = await prisma.canaryRelease.findUnique({
    where: { id: releaseId },
  });

  if (!release) {
    throw AppError.notFound("Canary release not found");
  }

  await prisma.canaryRelease.update({
    where: { id: releaseId },
    data: {
      status: "rolled_back",
      completedAt: new Date(),
    },
  });
}

/**
 * Scale deployment replicas
 */
export async function scaleDeployment(
  deploymentId: string,
  newReplicaCount: number
): Promise<void> {
  const deployment = await prisma.modelDeployment.findUnique({
    where: { id: deploymentId },
  });

  if (!deployment) {
    throw AppError.notFound("Deployment not found");
  }

  if (newReplicaCount < 1 || newReplicaCount > 1000) {
    throw AppError.validation(
      "Replica count must be between 1 and 1000"
    );
  }

  await prisma.modelDeployment.update({
    where: { id: deploymentId },
    data: {
      replicas: newReplicaCount,
      updatedAt: new Date(),
    },
  });
}

// ============================================================================
// Helper functions
// ============================================================================

function determineWinner(
  test: {
    successMetric: string;
    successThreshold: number;
    controlMetrics: unknown;
    treatmentMetrics: unknown;
  },
  metricName: string
): string | null {
  const controlMetrics = (test.controlMetrics as Record<string, number>) ?? {};
  const treatmentMetrics = (test.treatmentMetrics as Record<string, number>) ?? {};

  const controlValue = controlMetrics[metricName];
  const treatmentValue = treatmentMetrics[metricName];

  if (controlValue === undefined || treatmentValue === undefined) {
    return null;
  }

  // For most metrics, higher is better
  if (treatmentValue > controlValue + test.successThreshold) {
    return "treatment";
  } else if (controlValue > treatmentValue + test.successThreshold) {
    return "control";
  }

  return null;
}
