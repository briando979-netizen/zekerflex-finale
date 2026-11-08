import { prisma } from "@/lib/prisma";
import { z } from "zod";
import crypto from "crypto";

export const SharePermissionSchema = z.enum(["VIEW", "DOWNLOAD", "EDIT", "MANAGE"]);
export type SharePermission = z.infer<typeof SharePermissionSchema>;

export async function shareAsset(assetId: string, userId: string, permission: SharePermission) {
  return prisma.damAssetShare.create({
    data: {
      assetId,
      userId,
      permission,
      sharedAt: new Date(),
    },
  });
}

export async function createPublicLink(assetId: string, expiresIn?: number) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

  return prisma.damPublicLink.create({
    data: {
      assetId,
      token,
      expiresAt,
      downloads: 0,
    },
  });
}

export async function validatePublicLink(token: string) {
  const link = await prisma.damPublicLink.findUnique({ where: { token } });

  if (!link) return null;
  if (link.expiresAt && link.expiresAt < new Date()) return null;

  // Track download
  await prisma.damPublicLink.update({
    where: { token },
    data: { downloads: link.downloads + 1, lastAccessedAt: new Date() },
  });

  return link;
}

export async function revokePublicLink(token: string) {
  return prisma.damPublicLink.delete({ where: { token } });
}

export async function getUserShares(userId: string) {
  return prisma.damAssetShare.findMany({
    where: { userId },
    include: { asset: true },
  });
}

export async function getAssetShares(assetId: string) {
  return prisma.damAssetShare.findMany({
    where: { assetId },
    include: { user: { select: { id: true, email: true } } },
  });
}

export async function updateSharePermission(shareId: string, permission: SharePermission) {
  return prisma.damAssetShare.update({
    where: { id: shareId },
    data: { permission },
  });
}

export async function revokeShare(shareId: string) {
  return prisma.damAssetShare.delete({ where: { id: shareId } });
}

export async function trackDownload(assetId: string, userId?: string) {
  return prisma.damDownloadLog.create({
    data: {
      assetId,
      userId,
      downloadedAt: new Date(),
    },
  });
}

export async function getAssetDownloads(assetId: string): Promise<number> {
  return prisma.damDownloadLog.count({ where: { assetId } });
}
