import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const SearchQuerySchema = z.object({
  tenantId: z.string(),
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
  type: z.enum(["IMAGE", "VIDEO", "DOCUMENT", "AUDIO", "OTHER"]).optional(),
  folderId: z.string().optional(),
  sortBy: z.enum(["uploadedAt", "name", "fileSize", "popularity"]).default("uploadedAt"),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export async function searchAssets(query: SearchQuery) {
  let where: any = { tenantId: query.tenantId, archivedAt: null };

  // Full-text search
  if (query.query) {
    where.OR = [
      { name: { contains: query.query, mode: "insensitive" } },
      { description: { contains: query.query, mode: "insensitive" } },
    ];
  }

  // Tag filter
  if (query.tags?.length) {
    where.tags = { hasSome: query.tags };
  }

  // Type filter
  if (query.type) {
    where.type = query.type;
  }

  // Folder filter
  if (query.folderId) {
    where.folderId = query.folderId;
  }

  const assets = await prisma.damAsset.findMany({
    where,
    orderBy: { [query.sortBy]: "desc" },
    take: query.limit,
    skip: query.offset,
  });

  const total = await prisma.damAsset.count({ where });

  return { assets, total, hasMore: query.offset + query.limit < total };
}

export async function getPopularAssets(tenantId: string, limit: number = 10) {
  return prisma.damAsset.findMany({
    where: { tenantId, archivedAt: null },
    orderBy: { downloads: "desc" },
    take: limit,
  });
}

export async function searchByTag(tenantId: string, tag: string) {
  return prisma.damAsset.findMany({
    where: {
      tenantId,
      tags: { has: tag },
      archivedAt: null,
    },
  });
}

export async function getAssetsByType(tenantId: string, type: "IMAGE" | "VIDEO" | "DOCUMENT" | "AUDIO" | "OTHER") {
  return prisma.damAsset.findMany({
    where: { tenantId, type, archivedAt: null },
    orderBy: { uploadedAt: "desc" },
  });
}

export async function similarSearch(assetId: string): Promise<any[]> {
  const asset = await prisma.damAsset.findUnique({ where: { id: assetId } });
  if (!asset) return [];

  // Visual similarity or metadata-based similarity
  return prisma.damAsset.findMany({
    where: {
      tenantId: asset.tenantId,
      type: asset.type,
      id: { not: assetId },
      archivedAt: null,
    },
    take: 10,
  });
}
