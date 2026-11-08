import { prisma } from "@/lib/prisma";

export async function getAssetAnalytics(assetId: string) {
  const downloads = await prisma.damDownloadLog.count({ where: { assetId } });

  const shares = await prisma.damAssetShare.count({ where: { assetId } });

  const publicLinks = await prisma.damPublicLink.count({ where: { assetId } });

  const publicLinkDownloads = await prisma.damPublicLink.aggregate({
    where: { assetId },
    _sum: { downloads: true },
  });

  return {
    assetId,
    downloads,
    shares,
    publicLinks,
    publicLinkDownloads: publicLinkDownloads._sum.downloads ?? 0,
    lastAccessedAt: await getLastAccess(assetId),
  };
}

export async function getTenantAnalytics(tenantId: string) {
  const totalAssets = await prisma.damAsset.count({ where: { tenantId } });

  const assetsByType = await prisma.damAsset.groupBy({
    by: ["type"],
    where: { tenantId },
    _count: true,
  });

  const totalDownloads = await prisma.damDownloadLog.count({
    where: { asset: { tenantId } },
  });

  const storageUsage = await prisma.damAsset.aggregate({
    where: { tenantId },
    _sum: { fileSize: true },
  });

  const totalShares = await prisma.damAssetShare.count({
    where: { asset: { tenantId } },
  });

  const popularAssets = await prisma.damAsset.findMany({
    where: { tenantId },
    take: 10,
    orderBy: { downloads: "desc" },
  });

  return {
    tenantId,
    totalAssets,
    assetsByType: assetsByType.map((a) => ({ type: a.type, count: a._count })),
    totalDownloads,
    storageUsage: storageUsage._sum.fileSize ?? 0,
    totalShares,
    popularAssets,
  };
}

export async function getAssetUsageStats(assetId: string, days: number = 30) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const downloads = await prisma.damDownloadLog.count({
    where: { assetId, downloadedAt: { gte: cutoffDate } },
  });

  const uniqueDownloaders = await prisma.damDownloadLog.findMany({
    where: { assetId, downloadedAt: { gte: cutoffDate } },
    select: { userId: true },
    distinct: ["userId"],
  });

  return {
    assetId,
    period: `${days} days`,
    downloads,
    uniqueDownloaders: uniqueDownloaders.length,
    downloadTrend: await getDownloadTrend(assetId, days),
  };
}

async function getLastAccess(assetId: string) {
  const log = await prisma.damDownloadLog.findFirst({
    where: { assetId },
    orderBy: { downloadedAt: "desc" },
  });

  return log?.downloadedAt ?? null;
}

async function getDownloadTrend(assetId: string, days: number) {
  const logs = await prisma.damDownloadLog.findMany({
    where: { assetId },
    orderBy: { downloadedAt: "asc" },
  });

  const trend: Record<string, number> = {};
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    trend[dateStr] = 0;
  }

  for (const log of logs) {
    const dateStr = log.downloadedAt.toISOString().split("T")[0];
    if (trend[dateStr] !== undefined) {
      trend[dateStr]++;
    }
  }

  return trend;
}
