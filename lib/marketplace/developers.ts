import { prisma } from '@/lib/prisma';
import { DeveloperTier, REVENUE_SHARE_RATES } from './types';

export async function createDeveloper(data: {
  tenantId: string;
  supportEmail: string;
  tier?: DeveloperTier;
}) {
  const developer = await prisma.developer.create({
    data: {
      tenantId: data.tenantId,
      supportEmail: data.supportEmail,
      tier: data.tier || 'INDIVIDUAL',
      apiCallsLimit: getApiCallsLimit(data.tier || 'INDIVIDUAL'),
    },
  });
  return developer;
}

export function getApiCallsLimit(tier: DeveloperTier): number {
  const limits: Record<DeveloperTier, number> = {
    INDIVIDUAL: 100000,
    STARTUP: 500000,
    PROFESSIONAL: 5000000,
    ENTERPRISE: 50000000,
  };
  return limits[tier];
}

export function getRevenueShare(tier: DeveloperTier): number {
  return REVENUE_SHARE_RATES[tier];
}

export async function upgradeDeveloper(tenantId: string, newTier: DeveloperTier) {
  return prisma.developer.update({
    where: { tenantId },
    data: {
      tier: newTier,
      apiCallsLimit: getApiCallsLimit(newTier),
    },
  });
}

export async function recordApiCall(tenantId: string) {
  return prisma.developer.update({
    where: { tenantId },
    data: {
      apiCallsThisMonth: { increment: 1 },
    },
  });
}

export async function resetMonthlyApiCalls() {
  return prisma.developer.updateMany({
    data: {
      apiCallsThisMonth: 0,
    },
  });
}

export async function certifyDeveloper(tenantId: string) {
  return prisma.developer.update({
    where: { tenantId },
    data: {
      isCertified: true,
      certificationDate: new Date(),
    },
  });
}

export async function getDeveloperStats(tenantId: string) {
  const developer = await prisma.developer.findUnique({
    where: { tenantId },
    include: {
      tenant: {
        include: {
          apps: {
            where: { status: 'PUBLISHED' },
          },
        },
      },
    },
  });

  if (!developer) return null;

  // Get app metrics
  const apps = await prisma.marketplaceApp.findMany({
    where: { developerTenantId: tenantId },
  });

  const totalInstalls = apps.reduce((sum, app) => sum + app.installationCount, 0);
  const totalActiveInstallations = apps.reduce((sum, app) => sum + app.activeInstallations, 0);
  const totalRevenue = apps.reduce((sum, app) => sum + app.totalRevenueAllTimeCents, 0);

  return {
    developer,
    stats: {
      totalApps: apps.length,
      publishedApps: apps.filter(a => a.isPublished).length,
      totalInstalls,
      activeInstallations: totalActiveInstallations,
      totalRevenueAllTimeCents: totalRevenue,
      avgRating: apps.length > 0 ? apps.reduce((sum, a) => sum + a.averageRating, 0) / apps.length : 0,
      apiUsagePercent: (developer.apiCallsThisMonth / developer.apiCallsLimit) * 100,
    },
  };
}

export async function generateDeveloperApiKey(tenantId: string): Promise<string> {
  const key = `dk_${Math.random().toString(36).slice(2)}_${Date.now()}`;

  // In production, this would be stored securely in KV or encrypted in DB
  // For now just return the key
  return key;
}

export async function createIntegration(data: {
  name: string;
  description: string;
  category: string;
  type: 'WEBHOOK' | 'OAUTH' | 'API' | 'CUSTOM';
  authMethod: string;
}) {
  return prisma.integration.create({
    data: {
      slug: data.name.toLowerCase().replace(/\s+/g, '-'),
      ...data,
      configSchema: {},
    },
  });
}

export async function getIntegrations(category?: string) {
  return prisma.integration.findMany({
    where: {
      status: 'ACTIVE',
      ...(category && { category }),
    },
    orderBy: { tenantCount: 'desc' },
  });
}
