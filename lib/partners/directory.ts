// ---------------------------------------------------------------------------
// Partners Directory — Onboard partners, manage profiles, tiers
// Subsystem 1/6 for production Partner & Affiliate Management
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/prisma';
import { Partner, PartnerType, PartnerTier } from '@prisma/client';

export interface PartnerProfile {
  id: string;
  tenantId: string;
  type: PartnerType;
  tier: PartnerTier;
  name: string;
  description?: string;
  website?: string;
  logo?: string;
  primaryContactEmail: string;
  supportEmail?: string;
  phone?: string;
  status: string;
  revenueSplitPercentage: number;
  coMarketingAllowed: boolean;
  exclusivityRegions?: string[];
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface OnboardPartnerInput {
  tenantId: string;
  type: PartnerType;
  name: string;
  primaryContactEmail: string;
  supportEmail?: string;
  website?: string;
  tier?: PartnerTier;
}

/**
 * Onboard a new partner with initial profile and commission structure
 */
export async function onboardPartner(input: OnboardPartnerInput): Promise<PartnerProfile> {
  const tier = input.tier || 'SILVER';
  const revenueSplitMap: Record<PartnerTier, number> = {
    SILVER: 10,
    GOLD: 15,
    PLATINUM: 20,
  };

  const partner = await prisma.partner.create({
    data: {
      tenantId: input.tenantId,
      type: input.type,
      tier,
      primaryContactEmail: input.primaryContactEmail,
      supportEmail: input.supportEmail,
      revenueSplitPercentage: revenueSplitMap[tier],
      coMarketingAllowed: true,
    },
  });

  return mapPartnerProfile(partner);
}

/**
 * Get partner profile by ID
 */
export async function getPartnerProfile(partnerId: string): Promise<PartnerProfile | null> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
  });

  return partner ? mapPartnerProfile(partner) : null;
}

/**
 * Get partner profile by tenant ID
 */
export async function getPartnerByTenant(tenantId: string): Promise<PartnerProfile | null> {
  const partner = await prisma.partner.findUnique({
    where: { tenantId },
  });

  return partner ? mapPartnerProfile(partner) : null;
}

/**
 * Update partner profile
 */
export async function updatePartnerProfile(
  partnerId: string,
  updates: Partial<Omit<PartnerProfile, 'id' | 'tenantId' | 'createdAt'>>
): Promise<PartnerProfile> {
  const partner = await prisma.partner.update({
    where: { id: partnerId },
    data: {
      primaryContactEmail: updates.primaryContactEmail,
      supportEmail: updates.supportEmail,
      coMarketingAllowed: updates.coMarketingAllowed,
      exclusivityRegions: updates.exclusivityRegions ? JSON.stringify(updates.exclusivityRegions) : undefined,
    },
  });

  return mapPartnerProfile(partner);
}

/**
 * Upgrade partner tier
 */
export async function upgradePartnerTier(partnerId: string, newTier: PartnerTier): Promise<PartnerProfile> {
  const revenueSplitMap: Record<PartnerTier, number> = {
    SILVER: 10,
    GOLD: 15,
    PLATINUM: 20,
  };

  const partner = await prisma.partner.update({
    where: { id: partnerId },
    data: {
      tier: newTier,
      revenueSplitPercentage: revenueSplitMap[newTier],
    },
  });

  return mapPartnerProfile(partner);
}

/**
 * Downgrade partner tier
 */
export async function downgradePartnerTier(partnerId: string, newTier: PartnerTier): Promise<PartnerProfile> {
  return upgradePartnerTier(partnerId, newTier);
}

/**
 * Suspend a partner temporarily
 */
export async function suspendPartner(partnerId: string, reason?: string): Promise<PartnerProfile> {
  const partner = await prisma.partner.update({
    where: { id: partnerId },
    data: {
      status: 'SUSPENDED',
    },
  });

  return mapPartnerProfile(partner);
}

/**
 * Reactivate a suspended partner
 */
export async function reactivatePartner(partnerId: string): Promise<PartnerProfile> {
  const partner = await prisma.partner.update({
    where: { id: partnerId },
    data: {
      status: 'ACTIVE',
    },
  });

  return mapPartnerProfile(partner);
}

/**
 * Get all active partners by type
 */
export async function getPartnersByType(type: PartnerType): Promise<PartnerProfile[]> {
  const partners = await prisma.partner.findMany({
    where: {
      type,
      status: 'ACTIVE',
    },
    orderBy: { tier: 'desc' },
  });

  return partners.map(mapPartnerProfile);
}

/**
 * Get partners by tier
 */
export async function getPartnersByTier(tier: PartnerTier): Promise<PartnerProfile[]> {
  const partners = await prisma.partner.findMany({
    where: {
      tier,
      status: 'ACTIVE',
    },
    orderBy: { joinedAt: 'desc' },
  });

  return partners.map(mapPartnerProfile);
}

/**
 * List all partners with filtering
 */
export async function listPartners(opts?: {
  type?: PartnerType;
  tier?: PartnerTier;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ partners: PartnerProfile[]; total: number }> {
  const where: any = {};

  if (opts?.type) where.type = opts.type;
  if (opts?.tier) where.tier = opts.tier;
  if (opts?.status) where.status = opts.status;

  const [partners, total] = await Promise.all([
    prisma.partner.findMany({
      where,
      orderBy: { joinedAt: 'desc' },
      take: opts?.limit || 50,
      skip: opts?.offset || 0,
    }),
    prisma.partner.count({ where }),
  ]);

  return {
    partners: partners.map(mapPartnerProfile),
    total,
  };
}

/**
 * Get partner statistics
 */
export async function getPartnerStats(partnerId: string) {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
  });

  if (!partner) return null;

  const commissions = await prisma.commission.aggregate({
    where: { affiliateId: partnerId },
    _sum: { amount: true },
    _count: true,
  });

  const payouts = await prisma.payout.aggregate({
    where: { affiliateId: partnerId },
    _sum: { amount: true },
  });

  return {
    partnerId,
    tier: partner.tier,
    status: partner.status,
    customerCount: partner.customerCount,
    totalRevenueGeneratedCents: partner.totalRevenueGeneratedCents,
    totalCommissionsCents: commissions._sum.amount || 0,
    totalCommissionsCount: commissions._count,
    totalPayoutsCents: payouts._sum.amount || 0,
    joinedAt: partner.joinedAt,
  };
}

function mapPartnerProfile(partner: Partner): PartnerProfile {
  return {
    id: partner.id,
    tenantId: partner.tenantId,
    type: partner.type,
    tier: partner.tier,
    name: partner.tenantId, // Placeholder — actual name would come from tenant
    primaryContactEmail: partner.primaryContactEmail,
    supportEmail: partner.supportEmail ?? undefined,
    status: partner.status,
    revenueSplitPercentage: partner.revenueSplitPercentage,
    coMarketingAllowed: partner.coMarketingAllowed,
    exclusivityRegions: partner.exclusivityRegions ? JSON.parse(JSON.stringify(partner.exclusivityRegions)) : undefined,
    joinedAt: partner.joinedAt,
    createdAt: partner.createdAt,
    updatedAt: partner.updatedAt,
  };
}
