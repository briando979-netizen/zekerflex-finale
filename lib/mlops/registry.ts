/**
 * MLOps Model Registry
 * - Version control & metadata tracking
 * - Model promotion & rollback
 * - Version comparison
 */

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/error";

export interface ModelRegistryEntry {
  id: string;
  name: string;
  currentVersionId: string;
  totalVersions: number;
  lastUpdated: Date;
  status: "active" | "archived" | "deprecated";
}

export interface ModelVersionMetadata {
  versionId: string;
  version: string;
  status: "training" | "validated" | "deployed" | "rejected" | "archived";
  trainingRunId?: string;
  metrics: Record<string, number>;
  tags: string[];
  createdAt: Date;
  createdBy: string;
}

/**
 * Register a new model
 */
export async function registerModel(
  name: string,
  description: string,
  tenantId: string
): Promise<{ modelId: string }> {
  const existing = await prisma.model.findFirst({
    where: { name, tenantId },
  });

  if (existing) {
    throw AppError.validation("Model with this name already exists");
  }

  const model = await prisma.model.create({
    data: {
      name,
      description,
      tenantId,
      status: "active",
    },
  });

  return { modelId: model.id };
}

/**
 * Get model registry entry with version history
 */
export async function getModelRegistry(
  modelId: string
): Promise<ModelRegistryEntry> {
  const model = await prisma.model.findUnique({
    where: { id: modelId },
    include: {
      versions: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!model) {
    throw AppError.notFound("Model not found");
  }

  const totalVersions = await prisma.modelVersion.count({
    where: { modelId },
  });

  const currentVersion = model.versions[0];
  if (!currentVersion) {
    throw AppError.notFound("No versions found for model");
  }

  return {
    id: model.id,
    name: model.name,
    currentVersionId: currentVersion.id,
    totalVersions,
    lastUpdated: currentVersion.updatedAt,
    status: model.status as "active" | "archived" | "deprecated",
  };
}

/**
 * Get version metadata
 */
export async function getVersionMetadata(
  versionId: string
): Promise<ModelVersionMetadata> {
  const version = await prisma.modelVersion.findUnique({
    where: { id: versionId },
  });

  if (!version) {
    throw AppError.notFound("Model version not found");
  }

  return {
    versionId: version.id,
    version: version.version,
    status: version.status as
      | "training"
      | "validated"
      | "deployed"
      | "rejected"
      | "archived",
    trainingRunId: version.trainingRunId ?? undefined,
    metrics: (version.metrics as Record<string, number>) ?? {},
    tags: version.tags ?? [],
    createdAt: version.createdAt,
    createdBy: version.createdBy ?? "system",
  };
}

/**
 * List all versions of a model
 */
export async function listModelVersions(modelId: string) {
  const versions = await prisma.modelVersion.findMany({
    where: { modelId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      version: true,
      status: true,
      metrics: true,
      tags: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return versions;
}

/**
 * Tag a model version
 */
export async function tagModelVersion(
  versionId: string,
  tags: string[]
): Promise<void> {
  const version = await prisma.modelVersion.findUnique({
    where: { id: versionId },
  });

  if (!version) {
    throw AppError.notFound("Model version not found");
  }

  const existingTags = version.tags ?? [];
  const mergedTags = Array.from(new Set([...existingTags, ...tags]));

  await prisma.modelVersion.update({
    where: { id: versionId },
    data: {
      tags: mergedTags,
      updatedAt: new Date(),
    },
  });
}

/**
 * Promote a model version to production
 */
export async function promoteVersion(versionId: string): Promise<void> {
  const version = await prisma.modelVersion.findUnique({
    where: { id: versionId },
  });

  if (!version) {
    throw AppError.notFound("Model version not found");
  }

  if (version.status === "rejected") {
    throw AppError.validation("Cannot promote rejected versions");
  }

  // Get the model to find current production version
  const model = await prisma.model.findUnique({
    where: { id: version.modelId },
    include: {
      versions: {
        where: { status: "deployed" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!model) {
    throw AppError.notFound("Model not found");
  }

  // Demote previous production version
  if (model.versions.length > 0 && model.versions[0]) {
    await prisma.modelVersion.update({
      where: { id: model.versions[0].id },
      data: { status: "validated" },
    });
  }

  // Promote new version
  await prisma.modelVersion.update({
    where: { id: versionId },
    data: {
      status: "deployed",
      updatedAt: new Date(),
    },
  });
}

/**
 * Rollback to a previous version
 */
export async function rollbackVersion(
  modelId: string,
  targetVersionId: string
): Promise<void> {
  const model = await prisma.model.findUnique({
    where: { id: modelId },
    include: {
      versions: {
        where: { status: "deployed" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!model) {
    throw AppError.notFound("Model not found");
  }

  const targetVersion = await prisma.modelVersion.findUnique({
    where: { id: targetVersionId },
  });

  if (!targetVersion || targetVersion.modelId !== modelId) {
    throw AppError.notFound("Target version not found");
  }

  // Demote current production
  if (model.versions.length > 0 && model.versions[0]) {
    await prisma.modelVersion.update({
      where: { id: model.versions[0].id },
      data: { status: "validated" },
    });
  }

  // Promote target version
  await prisma.modelVersion.update({
    where: { id: targetVersionId },
    data: { status: "deployed" },
  });
}

/**
 * Compare two model versions
 */
export async function compareVersions(versionId1: string, versionId2: string) {
  const [version1, version2] = await Promise.all([
    prisma.modelVersion.findUnique({ where: { id: versionId1 } }),
    prisma.modelVersion.findUnique({ where: { id: versionId2 } }),
  ]);

  if (!version1 || !version2) {
    throw AppError.notFound("One or both versions not found");
  }

  const metrics1 = (version1.metrics as Record<string, number>) ?? {};
  const metrics2 = (version2.metrics as Record<string, number>) ?? {};

  const comparison: Record<string, { v1: number; v2: number; delta: number }> =
    {};

  for (const [key, value1] of Object.entries(metrics1)) {
    const value2 = metrics2[key] ?? 0;
    comparison[key] = {
      v1: value1 as number,
      v2: value2,
      delta: (value2 - (value1 as number)).toFixed(4) as unknown as number,
    };
  }

  return {
    version1: { id: version1.id, version: version1.version },
    version2: { id: version2.id, version: version2.version },
    metrics: comparison,
  };
}

/**
 * Archive a model version
 */
export async function archiveVersion(versionId: string): Promise<void> {
  const version = await prisma.modelVersion.findUnique({
    where: { id: versionId },
  });

  if (!version) {
    throw AppError.notFound("Model version not found");
  }

  if (version.status === "deployed") {
    throw AppError.validation("Cannot archive deployed versions");
  }

  await prisma.modelVersion.update({
    where: { id: versionId },
    data: { status: "archived" },
  });
}

/**
 * Get model lineage - trace version history
 */
export async function getModelLineage(modelId: string) {
  const model = await prisma.model.findUnique({
    where: { id: modelId },
  });

  if (!model) {
    throw AppError.notFound("Model not found");
  }

  const versions = await prisma.modelVersion.findMany({
    where: { modelId },
    include: {
      trainingRun: {
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    modelId: model.id,
    modelName: model.name,
    totalVersions: versions.length,
    lineage: versions.map((v) => ({
      versionId: v.id,
      version: v.version,
      status: v.status,
      createdAt: v.createdAt,
      trainingRun: v.trainingRun,
      metrics: v.metrics,
    })),
  };
}
