// ---------------------------------------------------------------------------
// Commission Tracking — Calculate commissions (percentage, flat, tiered)
// Subsystem 2/6 for production Partner & Affiliate Management
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/prisma';
import { PartnerTier } from '@prisma/client';

export interface CommissionRule {
  type: 'PERCENTAGE' | 'FLAT' | 'TIERED';
  value: number; // percentage (0-100) or cents
  tierThreshold?: number; // for TIERED: minimum revenue to qualify
  capCents?: number; // maximum commission per transaction
}

export interface CommissionCalculation {
  affiliateId: string;
  trackingId?: string;
  baseRevenueCents: number;
  rule: CommissionRule;
  calculatedCommissionCents: number;
  appliedRule: string;
}

const COMMISSION_RULES: Record<PartnerTier, CommissionRule> = {
  SILVER: {
    type: 'PERCENTAGE',
    value: 10, // 10% of revenue
  },
  GOLD: {
    type: 'TIERED',
    value: 15, // 15% base
    tierThreshold: 100000, // €1000 in revenue
  },
  PLATINUM: {
    type: 'TIERED',
    value: 20, // 20% base
    tierThreshold: 500000, // €5000 in revenue
  },
};

/**
 * Calculate commission based on partner tier and revenue
 */
export function calculateCommission(
  baseRevenueCents: number,
  rule: CommissionRule,
  previousYtdCents?: number
): CommissionCalculation {
  let calculatedCommissionCents = 0;
  let appliedRule = 'NONE';

  if (rule.type === 'PERCENTAGE') {
    calculatedCommissionCents = Math.floor((baseRevenueCents * rule.value) / 100);
    appliedRule = `PERCENTAGE_${rule.value}`;
  } else if (rule.type === 'FLAT') {
    calculatedCommissionCents = rule.value;
    appliedRule = 'FLAT';
  } else if (rule.type === 'TIERED') {
    const combined = (previousYtdCents || 0) + baseRevenueCents;
    if (combined >= (rule.tierThreshold || 0)) {
      const tieredPercentage = rule.value + (combined >= (rule.tierThreshold || 0) * 2 ? 5 : 0);
      calculatedCommissionCents = Math.floor((baseRevenueCents * tieredPercentage) / 100);
      appliedRule = `TIERED_${tieredPercentage}`;
    } else {
      calculatedCommissionCents = Math.floor((baseRevenueCents * (rule.value - 5)) / 100);
      appliedRule = `TIERED_BASE_${rule.value - 5}`;
    }
  }

  if (rule.capCents && calculatedCommissionCents > rule.capCents) {
    calculatedCommissionCents = rule.capCents;
    appliedRule += '_CAPPED';
  }

  return {
    affiliateId: '',
    baseRevenueCents,
    rule,
    calculatedCommissionCents,
    appliedRule,
  };
}

/**
 * Record a commission for an affiliate based on a tracking event
 */
export async function recordCommission(
  affiliateId: string,
  trackingId: string,
  baseRevenueCents: number,
  rule: CommissionRule
): Promise<{ commissionId: string; amountCents: number; status: string }> {
  const calc = calculateCommission(baseRevenueCents, rule);

  const commission = await prisma.commission.create({
    data: {
      affiliateId,
      trackingId,
      amount: calc.calculatedCommissionCents,
      status: 'PENDING',
      notes: `Recorded via ${calc.appliedRule}`,
    },
  });

  // Update affiliate's total earnings
  await prisma.affiliate.update({
    where: { id: affiliateId },
    data: {
      totalEarnings: { increment: calc.calculatedCommissionCents },
    },
  });

  return {
    commissionId: commission.id,
    amountCents: commission.amount,
    status: commission.status,
  };
}

/**
 * Approve pending commissions
 */
export async function approveCommissions(
  affiliateId: string,
  commissionIds: string[]
): Promise<{ approvedCount: number; totalAmountCents: number }> {
  const commissions = await prisma.commission.updateMany({
    where: {
      id: { in: commissionIds },
      affiliateId,
      status: 'PENDING',
    },
    data: {
      status: 'APPROVED',
    },
  });

  const amounts = await prisma.commission.aggregate({
    where: {
      id: { in: commissionIds },
      status: 'APPROVED',
    },
    _sum: { amount: true },
  });

  return {
    approvedCount: commissions.count,
    totalAmountCents: amounts._sum.amount || 0,
  };
}

/**
 * Dispute a commission (e.g., for fraud or error)
 */
export async function disputeCommission(
  commissionId: string,
  reason: string
): Promise<{ commissionId: string; status: string }> {
  const commission = await prisma.commission.findUnique({
    where: { id: commissionId },
  });

  if (!commission) throw new Error('Commission not found');

  // Reverse the earning if it hasn't been paid yet
  if (commission.status !== 'PAID') {
    await prisma.affiliate.update({
      where: { id: commission.affiliateId },
      data: {
        totalEarnings: { decrement: commission.amount },
      },
    });
  }

  const updated = await prisma.commission.update({
    where: { id: commissionId },
    data: {
      status: 'DISPUTED',
      notes: reason,
    },
  });

  return {
    commissionId: updated.id,
    status: updated.status,
  };
}

/**
 * Get commissions for an affiliate
 */
export async function getAffiliateCommissions(
  affiliateId: string,
  opts?: {
    status?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ commissions: any[]; total: number; totalAmount: number }> {
  const where: any = { affiliateId };
  if (opts?.status) where.status = opts.status;

  const [commissions, total, sum] = await Promise.all([
    prisma.commission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts?.limit || 50,
      skip: opts?.offset || 0,
      include: { tracking: true },
    }),
    prisma.commission.count({ where }),
    prisma.commission.aggregate({
      where,
      _sum: { amount: true },
    }),
  ]);

  return {
    commissions,
    total,
    totalAmount: sum._sum.amount || 0,
  };
}

/**
 * Get commission summary by status
 */
export async function getCommissionSummary(affiliateId: string) {
  const summary = await prisma.commission.groupBy({
    by: ['status'],
    where: { affiliateId },
    _count: true,
    _sum: { amount: true },
  });

  return summary.map((s) => ({
    status: s.status,
    count: s._count,
    totalCents: s._sum.amount || 0,
  }));
}

/**
 * Get tier-based commission rule
 */
export function getTierCommissionRule(tier: PartnerTier): CommissionRule {
  return COMMISSION_RULES[tier];
}

/**
 * Recalculate commissions for past transactions (e.g., after a tier upgrade)
 */
export async function recalculateCommissions(affiliateId: string): Promise<{ recalculatedCount: number }> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
  });

  if (!affiliate) throw new Error('Affiliate not found');

  const commissions = await prisma.commission.findMany({
    where: {
      affiliateId,
      status: 'PENDING',
    },
    include: { tracking: true },
  });

  // Note: actual recalculation logic would be applied here
  // This is a placeholder for the concept

  return {
    recalculatedCount: commissions.length,
  };
}
