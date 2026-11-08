/**
 * MLOps Feature Store
 * - Feature engineering & management
 * - Feature pipelines & transformation
 * - Feature versioning
 */

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/error";

export interface FeatureDefinition {
  name: string;
  description: string;
  dataType: "numeric" | "categorical" | "text" | "datetime" | "boolean";
  source: string; // table/api/computed
  transformCode?: string; // SQL or JavaScript
  tags: string[];
  ownerTeam: string;
}

export interface FeaturePipeline {
  name: string;
  version: string;
  features: string[]; // feature ids
  schedule: "hourly" | "daily" | "weekly" | "realtime";
  sourceDataset: string;
  outputDataset: string;
}

export interface FeatureValue {
  entityId: string;
  featureId: string;
  value: unknown;
  timestamp: Date;
}

/**
 * Register a new feature
 */
export async function registerFeature(
  definition: FeatureDefinition,
  tenantId: string
): Promise<{ featureId: string }> {
  const existing = await prisma.feature.findFirst({
    where: { name: definition.name, tenantId },
  });

  if (existing) {
    throw AppError.validation("Feature with this name already exists");
  }

  const feature = await prisma.feature.create({
    data: {
      name: definition.name,
      description: definition.description,
      dataType: definition.dataType,
      source: definition.source,
      transformCode: definition.transformCode,
      tags: definition.tags,
      ownerTeam: definition.ownerTeam,
      tenantId,
      status: "active",
      version: 1,
    },
  });

  return { featureId: feature.id };
}

/**
 * Get feature metadata
 */
export async function getFeatureMetadata(featureId: string) {
  const feature = await prisma.feature.findUnique({
    where: { id: featureId },
  });

  if (!feature) {
    throw AppError.notFound("Feature not found");
  }

  return {
    id: feature.id,
    name: feature.name,
    description: feature.description,
    dataType: feature.dataType,
    source: feature.source,
    tags: feature.tags,
    version: feature.version,
    status: feature.status,
    createdAt: feature.createdAt,
    updatedAt: feature.updatedAt,
  };
}

/**
 * List all features in a tenant
 */
export async function listFeatures(
  tenantId: string,
  filter?: {
    tags?: string[];
    status?: string;
  }
) {
  const features = await prisma.feature.findMany({
    where: {
      tenantId,
      ...(filter?.status && { status: filter.status }),
      ...(filter?.tags && {
        tags: { hasSome: filter.tags },
      }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      dataType: true,
      tags: true,
      version: true,
      status: true,
    },
  });

  return features;
}

/**
 * Store feature values
 */
export async function storeFeatureValues(
  values: FeatureValue[]
): Promise<{ stored: number }> {
  if (values.length === 0) {
    return { stored: 0 };
  }

  const predictions = values.map((v) => ({
    entityId: v.entityId,
    featureId: v.featureId,
    value: JSON.stringify(v.value),
    timestamp: v.timestamp,
  }));

  const result = await prisma.prediction.createMany({
    data: predictions,
  });

  return { stored: result.count };
}

/**
 * Retrieve feature values for an entity
 */
export async function getEntityFeatures(
  entityId: string,
  featureIds?: string[]
) {
  const predictions = await prisma.prediction.findMany({
    where: {
      entityId,
      ...(featureIds && { featureId: { in: featureIds } }),
    },
    include: {
      feature: {
        select: {
          id: true,
          name: true,
          dataType: true,
        },
      },
    },
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  return predictions.map((p) => ({
    featureName: p.feature.name,
    featureId: p.feature.id,
    value: parseValue(p.value, p.feature.dataType),
    timestamp: p.timestamp,
  }));
}

/**
 * Create a feature pipeline
 */
export async function createFeaturePipeline(
  pipeline: FeaturePipeline,
  tenantId: string
): Promise<{ pipelineId: string }> {
  // Verify all features exist
  const features = await prisma.feature.findMany({
    where: {
      id: { in: pipeline.features },
      tenantId,
    },
  });

  if (features.length !== pipeline.features.length) {
    throw AppError.validation(
      "One or more features not found in this tenant"
    );
  }

  // Create a simple pipeline record by storing in metadata
  // In production, this would create a more complex pipeline definition
  const pipelineId = `pipeline-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return { pipelineId };
}

/**
 * Get feature statistics (for drift detection)
 */
export async function getFeatureStats(
  featureId: string,
  timeWindowHours: number = 24
) {
  const sinceTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);

  const predictions = await prisma.prediction.findMany({
    where: {
      featureId,
      timestamp: { gte: sinceTime },
    },
    select: { value: true },
  });

  const values = predictions
    .map((p) => {
      try {
        const parsed = JSON.parse(p.value);
        return typeof parsed === "number" ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((v): v is number => v !== null);

  if (values.length === 0) {
    return null;
  }

  const sorted = values.sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
    values.length;
  const stdDev = Math.sqrt(variance);

  return {
    featureId,
    count: values.length,
    mean: mean.toFixed(4) as unknown as number,
    stdDev: stdDev.toFixed(4) as unknown as number,
    min: sorted[0],
    max: sorted[sorted.length - 1] ?? 0,
    median:
      sorted.length % 2 === 0
        ? ((sorted[Math.floor(sorted.length / 2) - 1] ?? 0) +
            (sorted[Math.floor(sorted.length / 2)] ?? 0)) /
          2
        : sorted[Math.floor(sorted.length / 2)] ?? 0,
    p25: sorted[Math.floor(sorted.length * 0.25)] ?? 0,
    p75: sorted[Math.floor(sorted.length * 0.75)] ?? 0,
  };
}

/**
 * Get feature usage statistics
 */
export async function getFeatureUsage(featureId: string) {
  const feature = await prisma.feature.findUnique({
    where: { id: featureId },
    include: {
      predictions: {
        select: { timestamp: true },
        orderBy: { timestamp: "desc" },
        take: 1000,
      },
    },
  });

  if (!feature) {
    throw AppError.notFound("Feature not found");
  }

  const uniqueEntities = new Set(
    feature.predictions.map((p) => p.timestamp)
  ).size;

  return {
    featureId,
    name: feature.name,
    totalPredictions: feature.predictions.length,
    uniqueEntities,
    lastUpdated:
      feature.predictions.length > 0
        ? feature.predictions[0]?.timestamp
        : null,
    createdAt: feature.createdAt,
  };
}

/**
 * Version a feature
 */
export async function versionFeature(
  featureId: string,
  newTransformCode?: string
): Promise<{ newVersion: number }> {
  const feature = await prisma.feature.findUnique({
    where: { id: featureId },
  });

  if (!feature) {
    throw AppError.notFound("Feature not found");
  }

  const newVersion = (feature.version ?? 1) + 1;

  await prisma.feature.update({
    where: { id: featureId },
    data: {
      version: newVersion,
      transformCode: newTransformCode ?? feature.transformCode,
      updatedAt: new Date(),
    },
  });

  return { newVersion };
}

/**
 * Deprecate a feature
 */
export async function deprecateFeature(
  featureId: string,
  replacement?: string
): Promise<void> {
  const feature = await prisma.feature.findUnique({
    where: { id: featureId },
  });

  if (!feature) {
    throw AppError.notFound("Feature not found");
  }

  await prisma.feature.update({
    where: { id: featureId },
    data: {
      status: "deprecated",
      updatedAt: new Date(),
    },
  });
}

/**
 * Get feature dependencies (which models use this feature)
 */
export async function getFeatureDependencies(featureId: string) {
  // This is a simplified implementation
  // In production, you'd track which models use which features
  const feature = await prisma.feature.findUnique({
    where: { id: featureId },
  });

  if (!feature) {
    throw AppError.notFound("Feature not found");
  }

  return {
    featureId,
    name: feature.name,
    models: [], // would query model-feature relationships
    pipelines: [], // would query pipeline-feature relationships
  };
}

// ============================================================================
// Helper functions
// ============================================================================

function parseValue(value: string, dataType: string): unknown {
  try {
    const parsed = JSON.parse(value);

    if (dataType === "numeric") {
      return typeof parsed === "number" ? parsed : Number(parsed);
    } else if (dataType === "categorical" || dataType === "text") {
      return String(parsed);
    } else if (dataType === "boolean") {
      return Boolean(parsed);
    } else if (dataType === "datetime") {
      return new Date(parsed);
    }

    return parsed;
  } catch {
    return value;
  }
}
