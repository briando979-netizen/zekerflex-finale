import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const CollectionSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  isSmart: z.boolean().default(false),
  rules: z.record(z.any()).optional(),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Collection = z.infer<typeof CollectionSchema>;

export async function createCollection(data: {
  tenantId: string;
  name: string;
  description?: string;
  createdBy: string;
  isSmart?: boolean;
  rules?: Record<string, any>;
}) {
  return prisma.damCollection.create({
    data: {
      tenantId: data.tenantId,
      name: data.name,
      description: data.description,
      createdBy: data.createdBy,
      isSmart: data.isSmart ?? false,
      rules: data.rules ?? {},
    },
  });
}

export async function addAssetToCollection(collectionId: string, assetId: string) {
  return prisma.damCollectionAsset.create({
    data: { collectionId, assetId },
  });
}

export async function removeAssetFromCollection(collectionId: string, assetId: string) {
  return prisma.damCollectionAsset.deleteMany({
    where: { collectionId, assetId },
  });
}

export async function getCollectionAssets(collectionId: string) {
  return prisma.damCollectionAsset.findMany({
    where: { collectionId },
    include: { asset: true },
  });
}

export async function getCollections(tenantId: string) {
  return prisma.damCollection.findMany({
    where: { tenantId },
    include: { _count: { select: { assets: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateCollection(
  collectionId: string,
  data: { name?: string; description?: string; rules?: Record<string, any> }
) {
  return prisma.damCollection.update({
    where: { id: collectionId },
    data: {
      ...data,
      updatedAt: new Date(),
    },
  });
}

export async function deleteCollection(collectionId: string) {
  // Remove all assets from collection
  await prisma.damCollectionAsset.deleteMany({ where: { collectionId } });

  // Delete collection
  return prisma.damCollection.delete({ where: { id: collectionId } });
}

export async function addCollectionComment(collectionId: string, userId: string, text: string) {
  return prisma.damCollectionComment.create({
    data: {
      collectionId,
      userId,
      text,
    },
  });
}

export async function getCollectionComments(collectionId: string) {
  return prisma.damCollectionComment.findMany({
    where: { collectionId },
    include: { user: { select: { id: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function shareCollection(collectionId: string, userId: string, permission: "VIEW" | "EDIT") {
  return prisma.damCollectionShare.create({
    data: {
      collectionId,
      userId,
      permission,
    },
  });
}
