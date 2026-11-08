import { prisma } from '@/lib/prisma';
import { PartnerTier, PartnerType, PARTNER_RATES } from './types';

export async function createPartner(data: {
  tenantId: string;
  type: PartnerType;
  primaryContactEmail: string;
  tier?: PartnerTier;
}) {
  const partner = await prisma.partner.create({
    data: {
      tenantId: data.tenantId,
      type: data.type,
      primaryContactEmail: data.primaryContactEmail,
      tier: data.tier || 'SILVER',
      revenueSplitPercentage: data.tier ? Math.round(PARTNER_RATES[data.tier] * 100) : 10,
    },
  });
  return partner;
}

export async function upgradePartnerTier(partnerId: string, newTier: PartnerTier) {
  return prisma.partner.update({
    where: { id: partnerId },
    data: {
      tier: newTier,
      revenueSplitPercentage: Math.round(PARTNER_RATES[newTier] * 100),
    },
  });
}

export async function recordPartnerRevenue(partnerId: string, revenueGeneratedCents: number) {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
  });

  if (!partner) return;

  const partnerShare = Math.floor(revenueGeneratedCents * (partner.revenueSplitPercentage / 100));

  await prisma.partner.update({
    where: { id: partnerId },
    data: {
      ytdRevenueShareCents: { increment: partnerShare },
      totalRevenueGeneratedCents: { increment: revenueGeneratedCents },
    },
  });
}

export async function getPartnersByType(type: PartnerType) {
  return prisma.partner.findMany({
    where: {
      type,
      status: 'ACTIVE',
    },
    orderBy: { tier: 'desc' },
  });
}

export async function getTopPartners(limit: number = 10) {
  return prisma.partner.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { totalRevenueGeneratedCents: 'desc' },
    take: limit,
  });
}

export async function createReseller(data: {
  tenantId: string;
  contactEmail: string;
  territory?: string;
  discountPercentage?: number;
}) {
  return prisma.reseller.create({
    data: {
      tenantId: data.tenantId,
      contactEmail: data.contactEmail,
      territory: data.territory,
      discountPercentage: data.discountPercentage || 15,
      commissionPercentageBasisPoints: 1000, // 10% default
    },
  });
}

export async function createAgency(data: {
  tenantId: string;
  contactEmail: string;
  services: string[];
}) {
  return prisma.agency.create({
    data: {
      tenantId: data.tenantId,
      contactEmail: data.contactEmail,
      services: data.services,
    },
  });
}

export async function certifyAgency(agencyId: string) {
  return prisma.agency.update({
    where: { id: agencyId },
    data: {
      isCertified: true,
    },
  });
}

export async function getCertifiedAgencies() {
  return prisma.agency.findMany({
    where: {
      isCertified: true,
      status: 'ACTIVE',
    },
    orderBy: { projectsCompleted: 'desc' },
  });
}

export async function recordAgencyProject(agencyId: string, revenueGeneratedCents: number) {
  await prisma.agency.update({
    where: { id: agencyId },
    data: {
      projectsCompleted: { increment: 1 },
      totalRevenueGeneratedCents: { increment: revenueGeneratedCents },
    },
  });
}
