// ---------------------------------------------------------------------------
// Attribution — Track partner-driven conversions (referral links, codes)
// Subsystem 3/6 for production Partner & Affiliate Management
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';

export interface ReferralLink {
  code: string;
  link: string;
  affiliateId: string;
  status: string;
  reward: number; // in cents
  rewardType: string;
  expiresAt?: Date;
  convertedAt?: Date;
  conversionCount: number;
}

export interface AttributionData {
  source: string;
  medium: string;
  campaign: string;
  content?: string;
}

/**
 * Generate a unique referral code
 */
function generateReferralCode(): string {
  return `zf_${randomBytes(8).toString('hex')}`;
}

/**
 * Generate a referral link for an affiliate
 */
export async function generateReferralLink(
  affiliateId: string,
  opts?: {
    rewardCents?: number;
    rewardType?: 'CREDIT' | 'DISCOUNT' | 'CASH';
    expiryDays?: number;
  }
): Promise<ReferralLink> {
  const code = generateReferralCode();
  const link = `https://zekerflex.nl/ref/${code}`;

  const referral = await prisma.referral.create({
    data: {
      referrerId: affiliateId,
      code,
      link,
      reward: opts?.rewardCents || 50000, // €500 default
      rewardType: opts?.rewardType || 'CREDIT',
      expiresAt: opts?.expiryDays
        ? new Date(Date.now() + opts.expiryDays * 24 * 60 * 60 * 1000)
        : undefined,
      status: 'ACTIVE',
    },
  });

  return {
    code: referral.code,
    link: referral.link,
    affiliateId: referral.referrerId,
    status: referral.status,
    reward: referral.reward,
    rewardType: referral.rewardType,
    expiresAt: referral.expiresAt ?? undefined,
    convertedAt: referral.convertedAt ?? undefined,
    conversionCount: 0,
  };
}

/**
 * Track a referral click/visit
 */
export async function trackReferralClick(
  code: string,
  userId: string,
  attribution: AttributionData,
  deviceId: string
): Promise<{ trackingId: string; trackingCode: string }> {
  const referral = await prisma.referral.findUnique({
    where: { code },
  });

  if (!referral) throw new Error('Referral code not found');

  // Check expiry
  if (referral.expiresAt && new Date() > referral.expiresAt) {
    throw new Error('Referral link has expired');
  }

  // Generate unique tracking code
  const trackingCode = `track_${randomBytes(12).toString('hex')}`;

  const tracking = await prisma.tracking.create({
    data: {
      affiliateId: referral.referrerId,
      userId,
      trackingCode,
      utm: attribution,
      deviceId,
      firstClick: new Date(),
      lastClick: new Date(),
      converted: false,
      conversionValue: 0,
      attributionModel: 'LAST_CLICK',
    },
  });

  return {
    trackingId: tracking.id,
    trackingCode,
  };
}

/**
 * Record a conversion from a tracked click
 */
export async function recordConversion(
  trackingCode: string,
  conversionValueCents: number,
  userId?: string
): Promise<{ trackingId: string; conversionRecorded: boolean; commissionCents: number }> {
  const tracking = await prisma.tracking.findUnique({
    where: { trackingCode },
  });

  if (!tracking) throw new Error('Tracking code not found');

  // Update tracking
  const updated = await prisma.tracking.update({
    where: { trackingCode },
    data: {
      converted: true,
      conversionValue: conversionValueCents,
      lastClick: new Date(),
      userId: userId || tracking.userId,
    },
  });

  // Get affiliate
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: tracking.affiliateId },
  });

  if (!affiliate) throw new Error('Affiliate not found');

  // Calculate commission (simplified: 10% of conversion value)
  const commissionCents = Math.floor(conversionValueCents * (affiliate.commissionRate / 100));

  // Record commission
  await prisma.commission.create({
    data: {
      affiliateId: tracking.affiliateId,
      trackingId: tracking.id,
      amount: commissionCents,
      status: 'PENDING',
      notes: `Conversion from tracking ${trackingCode}`,
    },
  });

  // Update affiliate stats
  await prisma.affiliate.update({
    where: { id: tracking.affiliateId },
    data: {
      totalConversions: { increment: 1 },
      totalEarnings: { increment: commissionCents },
    },
  });

  // Update referral conversion count
  const referral = await prisma.referral.findFirst({
    where: { code: tracking.trackingCode },
  });

  if (referral) {
    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        convertedAt: new Date(),
        status: 'CONVERTED',
      },
    });
  }

  return {
    trackingId: tracking.id,
    conversionRecorded: true,
    commissionCents,
  };
}

/**
 * Get tracking data for a referral link
 */
export async function getReferralTrackingData(code: string) {
  const referral = await prisma.referral.findUnique({
    where: { code },
    include: {
      referrer: true,
    },
  });

  if (!referral) throw new Error('Referral not found');

  const trackings = await prisma.tracking.findMany({
    where: {
      trackingCode: referral.code,
    },
    orderBy: { lastClick: 'desc' },
  });

  const conversions = trackings.filter((t) => t.converted);

  return {
    referralCode: referral.code,
    totalClicks: trackings.length,
    totalConversions: conversions.length,
    conversionRate: trackings.length > 0 ? (conversions.length / trackings.length) * 100 : 0,
    totalConversionValue: conversions.reduce((sum, t) => sum + t.conversionValue, 0),
    trackings,
  };
}

/**
 * Get affiliate's referral links
 */
export async function getAffiliateReferrals(
  affiliateId: string,
  opts?: {
    status?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ referrals: ReferralLink[]; total: number }> {
  const where: any = { referrerId: affiliateId };
  if (opts?.status) where.status = opts.status;

  const [referrals, total] = await Promise.all([
    prisma.referral.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts?.limit || 50,
      skip: opts?.offset || 0,
    }),
    prisma.referral.count({ where }),
  ]);

  return {
    referrals: referrals.map((r) => ({
      code: r.code,
      link: r.link,
      affiliateId: r.referrerId,
      status: r.status,
      reward: r.reward,
      rewardType: r.rewardType,
      expiresAt: r.expiresAt ?? undefined,
      convertedAt: r.convertedAt ?? undefined,
      conversionCount: 0, // Would be loaded separately if needed
    })),
    total,
  };
}

/**
 * Revoke a referral link
 */
export async function revokeReferralLink(code: string): Promise<void> {
  await prisma.referral.update({
    where: { code },
    data: { status: 'EXPIRED' },
  });
}

/**
 * Get attribution model performance
 */
export async function getAttributionModelAnalysis(affiliateId: string, modelType: string) {
  const trackings = await prisma.tracking.findMany({
    where: {
      affiliateId,
      attributionModel: modelType,
      converted: true,
    },
  });

  const totalValue = trackings.reduce((sum, t) => sum + t.conversionValue, 0);
  const totalCommission = trackings.reduce((sum, t) => sum + t.commission, 0);

  return {
    modelType,
    trackingCount: trackings.length,
    totalConversionValue: totalValue,
    totalCommission,
    avgValuePerConversion: trackings.length > 0 ? totalValue / trackings.length : 0,
    avgCommissionPerConversion: trackings.length > 0 ? totalCommission / trackings.length : 0,
  };
}

/**
 * Compare attribution models
 */
export async function compareAttributionModels(affiliateId: string) {
  const models = ['FIRST_CLICK', 'LAST_CLICK', 'LINEAR', 'POSITION_BASED'];
  const results = await Promise.all(
    models.map((model) => getAttributionModelAnalysis(affiliateId, model))
  );

  return results;
}
