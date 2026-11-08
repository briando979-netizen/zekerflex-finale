import { prisma } from "@/lib/prisma";
import { z } from "zod";

const assetSchema = z.object({
  name: z.string(),
  type: z.string(),
  location: z.string(),
  purchaseDate: z.date(),
  purchaseValue: z.number(),
  status: z.enum(["ACTIVE", "MAINTENANCE", "RETIRED"]),
});

export async function registerAsset(data: z.infer<typeof assetSchema>) {
  const validated = assetSchema.parse(data);
  return prisma.facilityAsset.create({
    data: { ...validated, currentValue: validated.purchaseValue },
  });
}

export async function trackAssetLifecycle(assetId: string) {
  const asset = await prisma.facilityAsset.findUniqueOrThrow({ where: { id: assetId } });
  const maintenance = await prisma.maintenanceTask.findMany({ where: { assetId } });
  const ageYears = (Date.now() - asset.purchaseDate.getTime()) / (365.25 * 86400000);

  const depreciation = asset.purchaseValue * 0.15 * ageYears; // 15% annual
  const currentValue = Math.max(0, asset.purchaseValue - depreciation);

  return {
    assetId,
    age: ageYears,
    currentValue,
    maintenanceCount: maintenance.length,
    status: asset.status,
    nextExpectedReplacement: ageYears > 5 ? "SOON" : "NOT_YET",
  };
}

export async function getAssetInventory(status?: string) {
  return prisma.facilityAsset.findMany({
    where: status ? { status } : undefined,
    include: { maintenanceTasks: { take: 1, orderBy: { createdAt: "desc" } } },
  });
}

export async function calculateAssetDepreciation(assetId: string) {
  const asset = await prisma.facilityAsset.findUniqueOrThrow({ where: { id: assetId } });
  const years = (Date.now() - asset.purchaseDate.getTime()) / (365.25 * 86400000);
  const depreciation = asset.purchaseValue * 0.15 * years;

  return {
    originalValue: asset.purchaseValue,
    depreciation,
    currentValue: Math.max(0, asset.purchaseValue - depreciation),
    yearlyDepreciation: asset.purchaseValue * 0.15,
  };
}

export async function planAssetReplacement() {
  const assets = await prisma.facilityAsset.findMany({ where: { status: "ACTIVE" } });
  const replacementPlan = [];

  for (const asset of assets) {
    const lifecycle = await trackAssetLifecycle(asset.id);
    if (lifecycle.nextExpectedReplacement === "SOON") {
      replacementPlan.push({
        assetId: asset.id,
        name: asset.name,
        priority: "HIGH",
        estimatedReplacement: new Date(Date.now() + 365 * 86400000),
      });
    }
  }

  return replacementPlan;
}
