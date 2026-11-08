import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { RenewalOpportunity } from "@prisma/client";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Renewal Management Module
//
// Renewal orchestration, upsell/cross-sell opportunities, and
// negotiation tracking for customer renewals.
// ---------------------------------------------------------------------------

export const CreateRenewalOpportunitySchema = z.object({
  tenantId: z.string(),
  contractEndDate: z.date(),
  renewalDate: z.date(),
  upsellItems: z.array(z.string()).default([]),
  crosssellItems: z.array(z.string()).default([]),
  ownerUserId: z.string().optional(),
});

export type CreateRenewalOpportunityInput = z.infer<typeof CreateRenewalOpportunitySchema>;

export const ProposeRenewalSchema = z.object({
  renewalValue: z.number().int().min(0),
  upsellItems: z.array(z.string()).default([]),
  crosssellItems: z.array(z.string()).default([]),
  proposedExpansion: z.number().int().min(0).optional(),
});

export type ProposeRenewalInput = z.infer<typeof ProposeRenewalSchema>;

export const NegotiateRenewalSchema = z.object({
  discountOffered: z.number().int().min(0).max(100).optional(),
  discountReason: z.string().optional(),
  negotiationNotes: z.string().optional(),
});

export type NegotiateRenewalInput = z.infer<typeof NegotiateRenewalSchema>;

/**
 * Create a new renewal opportunity.
 */
export async function createRenewalOpportunity(
  input: CreateRenewalOpportunityInput,
): Promise<RenewalOpportunity> {
  try {
    const validated = CreateRenewalOpportunitySchema.parse(input);

    // Check if renewal already exists
    let opportunity = await prisma.renewalOpportunity.findUnique({
      where: { tenantId: validated.tenantId },
    });

    if (opportunity) {
      return opportunity;
    }

    opportunity = await prisma.renewalOpportunity.create({
      data: {
        tenantId: validated.tenantId,
        contractEndDate: validated.contractEndDate,
        renewalDate: validated.renewalDate,
        upsellItems: validated.upsellItems,
        crosssellItems: validated.crosssellItems,
        ownerUserId: validated.ownerUserId ?? null,
        stage: "PROSPECT",
      },
    });

    logger.info("Renewal opportunity created", {
      opportunityId: opportunity.id,
      tenantId: validated.tenantId,
      contractEndDate: validated.contractEndDate.toISOString(),
    });

    return opportunity;
  } catch (err) {
    logger.error("Failed to create renewal opportunity", {
      error: (err as Error).message,
    });
    throw AppError.validation("Vervangingsmogelijkheid aanmaken mislukt.");
  }
}

/**
 * Get renewal opportunity for a tenant.
 */
export async function getRenewalOpportunity(
  tenantId: string,
): Promise<RenewalOpportunity | null> {
  return prisma.renewalOpportunity.findUnique({
    where: { tenantId },
  });
}

/**
 * Propose renewal terms and pricing.
 */
export async function proposeRenewal(
  tenantId: string,
  input: ProposeRenewalInput,
): Promise<RenewalOpportunity> {
  try {
    const validated = ProposeRenewalSchema.parse(input);

    const opportunity = await getRenewalOpportunity(tenantId);
    if (!opportunity) throw AppError.notFound("Vervangingsmogelijkheid niet gevonden.");

    const updated = await prisma.renewalOpportunity.update({
      where: { tenantId },
      data: {
        renewalValue: validated.renewalValue,
        renewalProposed: new Date(),
        upsellItems: validated.upsellItems,
        crosssellItems: validated.crosssellItems,
        proposedExpansion: validated.proposedExpansion ?? null,
        stage: "ACTIVE",
      },
    });

    logger.info("Renewal proposed", {
      tenantId,
      renewalValue: validated.renewalValue,
    });

    return updated;
  } catch (err) {
    logger.error("Failed to propose renewal", {
      tenantId,
      error: (err as Error).message,
    });
    throw AppError.validation("Vernieuwingsvoorstel mislukt.");
  }
}

/**
 * Update negotiation status.
 */
export async function negotiateRenewal(
  tenantId: string,
  input: NegotiateRenewalInput,
): Promise<RenewalOpportunity> {
  const validated = NegotiateRenewalSchema.parse(input);

  const opportunity = await getRenewalOpportunity(tenantId);
  if (!opportunity) throw AppError.notFound("Vervangingsmogelijkheid niet gevonden.");

  return prisma.renewalOpportunity.update({
    where: { tenantId },
    data: {
      discountOffered: validated.discountOffered ?? null,
      discountReason: validated.discountReason ?? null,
      negotiationNotes: validated.negotiationNotes ?? null,
      stage: "NEGOTIATING",
    },
  });
}

/**
 * Confirm a renewal as won.
 */
export async function confirmRenewal(tenantId: string): Promise<RenewalOpportunity> {
  const opportunity = await getRenewalOpportunity(tenantId);
  if (!opportunity) throw AppError.notFound("Vervangingsmogelijkheid niet gevonden.");

  if (!opportunity.renewalValue) {
    throw AppError.validation("Vernieuwingswaarde moet worden ingesteld.");
  }

  const updated = await prisma.renewalOpportunity.update({
    where: { tenantId },
    data: {
      renewalConfirmed: new Date(),
      stage: "WON",
    },
  });

  logger.info("Renewal confirmed", {
    tenantId,
    renewalValue: opportunity.renewalValue,
    upsellItems: opportunity.upsellItems,
  });

  return updated;
}

/**
 * Mark renewal as lost.
 */
export async function loseRenewal(
  tenantId: string,
  reason?: string,
): Promise<RenewalOpportunity> {
  return prisma.renewalOpportunity.update({
    where: { tenantId },
    data: {
      renewalLost: new Date(),
      lostReason: reason ?? null,
      stage: "LOST",
    },
  });
}

/**
 * Get renewal opportunities by stage.
 */
export async function getRenewalsByStage(
  stage: string,
  limit = 50,
): Promise<RenewalOpportunity[]> {
  return prisma.renewalOpportunity.findMany({
    where: { stage: stage as any },
    orderBy: { contractEndDate: "asc" },
    take: limit,
  });
}

/**
 * Get renewals due in the next N days.
 */
export async function getUpcomingRenewals(daysAhead = 90): Promise<RenewalOpportunity[]> {
  const today = new Date();
  const futureDate = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  return prisma.renewalOpportunity.findMany({
    where: {
      contractEndDate: {
        gte: today,
        lte: futureDate,
      },
      renewalConfirmed: null,
      renewalLost: null,
    },
    orderBy: { contractEndDate: "asc" },
  });
}

/**
 * Identify upsell opportunities based on customer profile.
 */
export function identifyUpsellOpportunities(
  currentUsage: {
    activeUsers: number;
    apiCallsPerMonth: number;
    storageGb: number;
  },
): {
  items: Array<{
    name: string;
    estimatedValue: number;
    rationale: string;
  }>;
  totalPotential: number;
} {
  const items: Array<{
    name: string;
    estimatedValue: number;
    rationale: string;
  }> = [];

  if (currentUsage.activeUsers > 50) {
    items.push({
      name: "Enterprise Plan",
      estimatedValue: 5000,
      rationale: "High user count indicates need for enterprise features",
    });
  }

  if (currentUsage.apiCallsPerMonth > 1000000) {
    items.push({
      name: "API Premium",
      estimatedValue: 2000,
      rationale: "Heavy API usage - premium support recommended",
    });
  }

  if (currentUsage.storageGb > 500) {
    items.push({
      name: "Storage Add-on",
      estimatedValue: 1000,
      rationale: "Storage approaching limits",
    });
  }

  const totalPotential = items.reduce((sum, item) => sum + item.estimatedValue, 0);

  return { items, totalPotential };
}

/**
 * Calculate renewal MRR trend to predict churn risk.
 */
export async function calculateRenewalTrend(tenantId: string): Promise<{
  current_mrr: number;
  previous_mrr: number;
  growth_rate: number;
  churn_risk: boolean;
}> {
  const opportunity = await getRenewalOpportunity(tenantId);
  if (!opportunity) {
    throw AppError.notFound("Vervangingsmogelijkheid niet gevonden.");
  }

  // In production, this would fetch actual MRR data
  const currentMrr = opportunity.renewalValue ?? 0;
  const previousMrr = currentMrr; // Would be fetched from billing history
  const growthRate = previousMrr > 0 ? (currentMrr - previousMrr) / previousMrr : 0;

  const churnRisk = growthRate < -0.1; // > 10% decline

  return {
    current_mrr: currentMrr,
    previous_mrr: previousMrr,
    growth_rate: Math.round(growthRate * 100),
    churn_risk: churnRisk,
  };
}

/**
 * Generate renewal summary for dashboard.
 */
export async function getRenewalSummary(): Promise<{
  total_opportunities: number;
  active_negotiations: number;
  won_renewals: number;
  lost_renewals: number;
  upcoming_90_days: number;
  total_renewal_value: number;
}> {
  const all_opportunities = await prisma.renewalOpportunity.findMany();
  const upcoming = await getUpcomingRenewals(90);

  const summary = {
    total_opportunities: all_opportunities.length,
    active_negotiations: all_opportunities.filter((o) => o.stage === "NEGOTIATING").length,
    won_renewals: all_opportunities.filter((o) => o.stage === "WON").length,
    lost_renewals: all_opportunities.filter((o) => o.stage === "LOST").length,
    upcoming_90_days: upcoming.length,
    total_renewal_value: all_opportunities.reduce((sum, o) => sum + (o.renewalValue ?? 0), 0),
  };

  return summary;
}
