import { prisma } from "@/lib/prisma";
import { z } from "zod";

const assetSchema = z.object({
  tenantId: z.string(),
  name: z.string(),
  category: z.string(),
  serialNumber: z.string().optional(),
  assetTag: z.string().optional(),
  description: z.string().optional(),
  purchaseDateCents: z.number().int().min(0),
  purchaseDate: z.coerce.date(),
  depreciationYears: z.number().int().min(1),
  deprecationMethod: z.enum(["STRAIGHT_LINE", "DECLINING_BALANCE"]).default("STRAIGHT_LINE"),
  owner: z.string().optional(),
  location: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DISPOSED", "MAINTENANCE"]).default("ACTIVE"),
  customFields: z.record(z.unknown()).optional(),
});

export type Asset = z.infer<typeof assetSchema>;

/**
 * Create a new asset
 */
export async function createAsset(data: Asset) {
  const validated = assetSchema.parse(data);

  const asset = await prisma.asset.create({
    data: {
      tenantId: validated.tenantId,
      name: validated.name,
      category: validated.category,
      serialNumber: validated.serialNumber,
      assetTag: validated.assetTag,
      description: validated.description,
      purchasePriceCents: validated.purchaseDateCents,
      purchaseDate: validated.purchaseDate,
      depreciationYears: validated.depreciationYears,
      depreciationMethod: validated.deprecationMethod,
      owner: validated.owner,
      location: validated.location,
      status: validated.status,
      customFields: validated.customFields || {},
    },
  });

  return asset;
}

/**
 * Get asset by ID with depreciation calculations
 */
export async function getAsset(assetId: string) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: {
      _count: {
        select: { movements: true },
      },
    },
  });

  if (!asset) {
    throw new Error(`Asset ${assetId} not found`);
  }

  return {
    ...asset,
    currentValue: calculateCurrentValue(asset),
    accumulatedDepreciation: calculateAccumulatedDepreciation(asset),
  };
}

/**
 * Calculate depreciation for an asset
 */
function calculateCurrentValue(asset: any): number {
  if (asset.status === "DISPOSED") return 0;

  const now = new Date();
  const monthsOwned = Math.floor(
    (now.getTime() - asset.purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
  );
  const totalMonths = asset.depreciationYears * 12;
  const monthlyDepreciation = asset.purchasePriceCents / totalMonths;

  const depreciated = Math.min(
    asset.purchasePriceCents,
    monthlyDepreciation * monthsOwned
  );

  return Math.max(0, asset.purchasePriceCents - depreciated);
}

/**
 * Calculate accumulated depreciation
 */
function calculateAccumulatedDepreciation(asset: any): number {
  if (asset.status === "DISPOSED") return asset.purchasePriceCents;

  const now = new Date();
  const monthsOwned = Math.floor(
    (now.getTime() - asset.purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
  );
  const totalMonths = asset.depreciationYears * 12;
  const monthlyDepreciation = asset.purchasePriceCents / totalMonths;

  return Math.min(asset.purchasePriceCents, monthlyDepreciation * monthsOwned);
}

/**
 * Update asset status and location
 */
export async function updateAssetStatus(
  assetId: string,
  status: "ACTIVE" | "INACTIVE" | "DISPOSED" | "MAINTENANCE",
  location?: string
) {
  const asset = await prisma.asset.update({
    where: { id: assetId },
    data: {
      status,
      location: location || undefined,
      updatedAt: new Date(),
    },
  });

  return asset;
}

/**
 * Record asset movement (transfer to new location or owner)
 */
export async function recordAssetMovement(
  assetId: string,
  fromLocation: string,
  toLocation: string,
  newOwner?: string,
  notes?: string
) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
  });

  if (!asset) {
    throw new Error(`Asset ${assetId} not found`);
  }

  const movement = await prisma.assetMovement.create({
    data: {
      assetId,
      fromLocation,
      toLocation,
      previousOwner: asset.owner || undefined,
      newOwner: newOwner || asset.owner,
      notes,
    },
  });

  // Update asset location and owner
  await prisma.asset.update({
    where: { id: assetId },
    data: {
      location: toLocation,
      owner: newOwner || asset.owner,
      updatedAt: new Date(),
    },
  });

  return movement;
}

/**
 * Get all assets for a tenant with filtering
 */
export async function getTenantAssets(
  tenantId: string,
  options?: {
    category?: string;
    status?: string;
    owner?: string;
    location?: string;
    limit?: number;
    offset?: number;
  }
) {
  const { category, status, owner, location, limit = 50, offset = 0 } = options || {};

  const assets = await prisma.asset.findMany({
    where: {
      tenantId,
      ...(category && { category }),
      ...(status && { status }),
      ...(owner && { owner }),
      ...(location && { location }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  const total = await prisma.asset.count({
    where: {
      tenantId,
      ...(category && { category }),
      ...(status && { status }),
      ...(owner && { owner }),
      ...(location && { location }),
    },
  });

  return {
    assets: assets.map((a) => ({
      ...a,
      currentValue: calculateCurrentValue(a),
      accumulatedDepreciation: calculateAccumulatedDepreciation(a),
    })),
    total,
    limit,
    offset,
  };
}

/**
 * Get asset movement history
 */
export async function getAssetMovementHistory(assetId: string) {
  const movements = await prisma.assetMovement.findMany({
    where: { assetId },
    orderBy: { recordedAt: "desc" },
  });

  return movements;
}

/**
 * Calculate total asset value for a tenant
 */
export async function calculateTotalAssetValue(tenantId: string) {
  const assets = await prisma.asset.findMany({
    where: { tenantId, status: { not: "DISPOSED" } },
  });

  const totalValue = assets.reduce(
    (sum, a) => sum + calculateCurrentValue(a),
    0
  );

  return {
    totalAssetValue: totalValue,
    totalPurchaseValue: assets.reduce((sum, a) => sum + a.purchasePriceCents, 0),
    totalDepreciation: assets.reduce(
      (sum, a) => sum + calculateAccumulatedDepreciation(a),
      0
    ),
    assetCount: assets.length,
  };
}

/**
 * Generate depreciation report for accounting
 */
export async function generateDepreciationReport(tenantId: string, period: "MONTHLY" | "QUARTERLY" | "ANNUAL") {
  const assets = await prisma.asset.findMany({
    where: { tenantId },
  });

  const report = {
    period,
    generatedAt: new Date(),
    assets: assets.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      purchasePriceCents: a.purchasePriceCents,
      accumulatedDepreciation: calculateAccumulatedDepreciation(a),
      currentValue: calculateCurrentValue(a),
      monthlyDepreciation: a.purchasePriceCents / (a.depreciationYears * 12),
    })),
  };

  return report;
}
