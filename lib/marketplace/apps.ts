import { prisma } from '@/lib/prisma';
import { AppStatus, AppCategory } from './types';

export async function createApp(data: {
  name: string;
  description: string;
  developerTenantId: string;
  category: AppCategory;
}) {
  const app = await prisma.marketplaceApp.create({
    data: {
      slug: data.name.toLowerCase().replace(/\s+/g, '-'),
      ...data,
      oauthClientId: `app_${Math.random().toString(36).slice(2)}`,
      oauthClientSecret: `secret_${Math.random().toString(36).slice(2)}`,
      oauthRedirectUris: [],
    },
  });
  return app;
}

export async function publishApp(appId: string) {
  const app = await prisma.marketplaceApp.update({
    where: { id: appId },
    data: {
      status: 'PUBLISHED',
      isPublished: true,
      publishedAt: new Date(),
    },
  });
  return app;
}

export async function getAppsByDeveloper(developerTenantId: string) {
  return prisma.marketplaceApp.findMany({
    where: { developerTenantId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getPublishedApps(category?: AppCategory) {
  return prisma.marketplaceApp.findMany({
    where: {
      isPublished: true,
      status: 'PUBLISHED',
      ...(category && { category }),
    },
    orderBy: { installationCount: 'desc' },
    take: 100,
  });
}

export async function getAppDetails(appSlug: string) {
  return prisma.marketplaceApp.findUnique({
    where: { slug: appSlug },
    include: {
      installations: { where: { isActive: true } },
      reviews: { orderBy: { createdAt: 'desc' }, take: 5 },
      analytics: { orderBy: { date: 'desc' }, take: 30 },
    },
  });
}

export async function installApp(data: {
  appId: string;
  tenantId: string;
  scopes: string[];
}) {
  const installation = await prisma.marketplaceAppInstallation.upsert({
    where: {
      appId_tenantId: {
        appId: data.appId,
        tenantId: data.tenantId,
      },
    },
    create: {
      appId: data.appId,
      tenantId: data.tenantId,
      scopes: data.scopes,
      accessToken: `token_${Math.random().toString(36).slice(2)}`,
      isActive: true,
    },
    update: {
      isActive: true,
      scopes: data.scopes,
      lastAccessedAt: new Date(),
    },
  });

  // Increment installation count
  await prisma.marketplaceApp.update({
    where: { id: data.appId },
    data: {
      installationCount: { increment: installation.installationDate ? 0 : 1 },
      activeInstallations: { increment: 1 },
    },
  });

  return installation;
}

export async function uninstallApp(appId: string, tenantId: string) {
  await prisma.marketplaceAppInstallation.update({
    where: {
      appId_tenantId: { appId, tenantId },
    },
    data: { isActive: false },
  });

  await prisma.marketplaceApp.update({
    where: { id: appId },
    data: { activeInstallations: { decrement: 1 } },
  });
}

export async function reviewApp(data: {
  appId: string;
  tenantId: string;
  rating: number;
  title: string;
  content: string;
}) {
  const review = await prisma.appReview.create({
    data: {
      appId: data.appId,
      tenantId: data.tenantId,
      rating: Math.min(5, Math.max(1, data.rating)),
      title: data.title,
      content: data.content,
      isVerifiedPurchase: true,
    },
  });

  // Update app rating
  const reviews = await prisma.appReview.findMany({
    where: { appId: data.appId },
  });

  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  await prisma.marketplaceApp.update({
    where: { id: data.appId },
    data: {
      averageRating: avgRating,
      reviewCount: reviews.length,
    },
  });

  return review;
}

export async function getAppAnalytics(appId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return prisma.appAnalytics.findMany({
    where: {
      appId,
      date: { gte: startDate },
    },
    orderBy: { date: 'asc' },
  });
}

export async function recordAppEvent(appId: string, type: string, tenantId: string, metadata?: any) {
  return prisma.appEvent.create({
    data: {
      appId,
      type,
      tenantId,
      metadata: metadata || {},
    },
  });
}

export async function updateAppRevenue(appId: string, revenueGeneratedCents: number) {
  const app = await prisma.marketplaceApp.findUnique({
    where: { id: appId },
  });

  if (!app) return;

  const platformFee = Math.floor(revenueGeneratedCents * (app.platformFeeBasisPoints / 10000));
  const developerShare = revenueGeneratedCents - platformFee;

  await prisma.marketplaceApp.update({
    where: { id: appId },
    data: {
      totalRevenueAllTimeCents: { increment: revenueGeneratedCents },
      monthlyRecurringRevenueCents: { increment: Math.floor(revenueGeneratedCents / 30) },
    },
  });
}
