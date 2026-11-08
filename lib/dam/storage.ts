import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const AssetSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["IMAGE", "VIDEO", "DOCUMENT", "AUDIO", "OTHER"]),
  mimeType: z.string(),
  fileSize: z.number(),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  folderId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.any()).optional(),
  versions: z.array(z.object({ version: z.number(), url: z.string().url(), createdAt: z.date() })).default([]),
  uploadedBy: z.string(),
  uploadedAt: z.date(),
  updatedAt: z.date(),
  archivedAt: z.date().optional(),
});

export type Asset = z.infer<typeof AssetSchema>;

export async function createAsset(data: {
  tenantId: string;
  name: string;
  type: "IMAGE" | "VIDEO" | "DOCUMENT" | "AUDIO" | "OTHER";
  mimeType: string;
  fileSize: number;
  url: string;
  uploadedBy: string;
  folderId?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}) {
  return prisma.damAsset.create({
    data: {
      tenantId: data.tenantId,
      name: data.name,
      type: data.type,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
      url: data.url,
      uploadedBy: data.uploadedBy,
      folderId: data.folderId,
      tags: data.tags ?? [],
      metadata: data.metadata ?? {},
      versions: { create: [{ version: 1, url: data.url }] },
    },
  });
}

export async function updateAsset(id: string, data: Partial<Asset>) {
  return prisma.damAsset.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      tags: data.tags,
      metadata: data.metadata,
      updatedAt: new Date(),
    },
  });
}

export async function getAsset(id: string) {
  return prisma.damAsset.findUnique({
    where: { id },
    include: { versions: true },
  });
}

export async function listAssets(tenantId: string, folderId?: string) {
  return prisma.damAsset.findMany({
    where: { tenantId, folderId, archivedAt: null },
    include: { versions: true },
    orderBy: { uploadedAt: "desc" },
  });
}

export async function archiveAsset(id: string) {
  return prisma.damAsset.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
}

export async function restoreAsset(id: string) {
  return prisma.damAsset.update({
    where: { id },
    data: { archivedAt: null },
  });
}
