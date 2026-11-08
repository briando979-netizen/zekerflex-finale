import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

// ============================================================================
// 2. ASSET MANAGEMENT - Digital assets, versioning, approvals, brand guidelines
// ============================================================================

const CreateAssetSchema = z.object({
  campaignId: z.string(),
  name: z.string().min(1, "Assetnaam is verplicht"),
  description: z.string().optional(),
  type: z.enum(["IMAGE", "VIDEO", "DOCUMENT", "TEMPLATE", "AUDIO", "DESIGN"]),
  category: z.string().optional(),
  fileUrl: z.string().url("Geldige URL vereist"),
  fileSize: z.number().positive(),
  mimeType: z.string(),
  tags: z.array(z.string()).optional(),
  brandGuidelineId: z.string().optional(),
});

const UpdateAssetSchema = CreateAssetSchema.partial();

export type CreateAssetInput = z.infer<typeof CreateAssetSchema>;
export type UpdateAssetInput = z.infer<typeof UpdateAssetSchema>;

/**
 * Create a new digital asset
 */
export async function createDigitalAsset(input: CreateAssetInput) {
  const validated = CreateAssetSchema.parse(input);

  // Verify campaign exists
  const campaign = await prisma.mrmCampaign.findUnique({
    where: { id: validated.campaignId },
  });

  if (!campaign) {
    throw AppError.notFound("Campagne niet gevonden");
  }

  return prisma.mrmDigitalAsset.create({
    data: {
      campaignId: validated.campaignId,
      name: validated.name,
      description: validated.description,
      type: validated.type,
      category: validated.category,
      fileUrl: validated.fileUrl,
      fileSize: validated.fileSize,
      mimeType: validated.mimeType,
      tags: validated.tags || [],
      brandGuidelineId: validated.brandGuidelineId,
      approvalStatus: "PENDING",
    },
  });
}

/**
 * Get assets for a campaign
 */
export async function getAssetsByCampaign(
  campaignId: string,
  filters?: {
    type?: string;
    approvalStatus?: string;
    limit?: number;
    offset?: number;
  },
) {
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;

  const where: any = { campaignId };
  if (filters?.type) where.type = filters.type;
  if (filters?.approvalStatus) where.approvalStatus = filters.approvalStatus;

  const [assets, total] = await Promise.all([
    prisma.mrmDigitalAsset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.mrmDigitalAsset.count({ where }),
  ]);

  return { assets, total, limit, offset };
}

/**
 * Get a single asset by ID
 */
export async function getAssetById(id: string) {
  const asset = await prisma.mrmDigitalAsset.findUnique({
    where: { id },
  });

  if (!asset) {
    throw AppError.notFound("Asset niet gevonden");
  }

  return asset;
}

/**
 * Update an asset
 */
export async function updateDigitalAsset(
  id: string,
  input: UpdateAssetInput,
) {
  const validated = UpdateAssetSchema.parse(input);

  const existing = await prisma.mrmDigitalAsset.findUnique({
    where: { id },
  });

  if (!existing) {
    throw AppError.notFound("Asset niet gevonden");
  }

  return prisma.mrmDigitalAsset.update({
    where: { id },
    data: {
      ...(validated.name !== undefined && { name: validated.name }),
      ...(validated.description !== undefined && { description: validated.description }),
      ...(validated.category !== undefined && { category: validated.category }),
      ...(validated.tags !== undefined && { tags: validated.tags }),
    },
  });
}

/**
 * Approve an asset
 */
export async function approveAsset(
  id: string,
  approvedBy: string,
  notes?: string,
) {
  const asset = await prisma.mrmDigitalAsset.findUnique({
    where: { id },
  });

  if (!asset) {
    throw AppError.notFound("Asset niet gevonden");
  }

  return prisma.mrmDigitalAsset.update({
    where: { id },
    data: {
      approvalStatus: "APPROVED",
      approvedBy,
      approvalNotes: notes,
    },
  });
}

/**
 * Reject an asset
 */
export async function rejectAsset(
  id: string,
  rejectedBy: string,
  reason: string,
) {
  const asset = await prisma.mrmDigitalAsset.findUnique({
    where: { id },
  });

  if (!asset) {
    throw AppError.notFound("Asset niet gevonden");
  }

  return prisma.mrmDigitalAsset.update({
    where: { id },
    data: {
      approvalStatus: "REJECTED",
      approvedBy: rejectedBy,
      approvalNotes: reason,
    },
  });
}

/**
 * Create a new version of an asset
 */
export async function createAssetVersion(
  parentAssetId: string,
  input: CreateAssetInput,
) {
  const parent = await prisma.mrmDigitalAsset.findUnique({
    where: { id: parentAssetId },
  });

  if (!parent) {
    throw AppError.notFound("Origineel asset niet gevonden");
  }

  const validated = CreateAssetSchema.parse(input);

  const newVersion = await prisma.mrmDigitalAsset.create({
    data: {
      campaignId: parent.campaignId,
      name: validated.name,
      description: validated.description,
      type: validated.type,
      category: validated.category,
      fileUrl: validated.fileUrl,
      fileSize: validated.fileSize,
      mimeType: validated.mimeType,
      tags: validated.tags || [],
      parentAssetId,
      version: parent.version + 1,
      approvalStatus: "PENDING",
    },
  });

  return newVersion;
}

/**
 * Get all versions of an asset
 */
export async function getAssetVersions(parentAssetId: string) {
  const versions = await prisma.mrmDigitalAsset.findMany({
    where: {
      OR: [
        { id: parentAssetId },
        { parentAssetId },
      ],
    },
    orderBy: { version: "asc" },
  });

  return versions;
}

/**
 * Track asset usage
 */
export async function trackAssetUsage(id: string) {
  const asset = await prisma.mrmDigitalAsset.findUnique({
    where: { id },
  });

  if (!asset) {
    throw AppError.notFound("Asset niet gevonden");
  }

  return prisma.mrmDigitalAsset.update({
    where: { id },
    data: {
      usage: { increment: 1 },
    },
  });
}

/**
 * Search assets by tag
 */
export async function searchAssetsByTag(campaignId: string, tag: string) {
  return prisma.mrmDigitalAsset.findMany({
    where: {
      campaignId,
      tags: {
        has: tag,
      },
    },
    orderBy: { usage: "desc" },
  });
}

/**
 * Get assets pending approval
 */
export async function getPendingApprovalAssets(limit = 50) {
  return prisma.mrmDigitalAsset.findMany({
    where: {
      approvalStatus: "PENDING",
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}
