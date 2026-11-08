import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { CustomerEngagement } from "@prisma/client";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Engagement Tracking Module
//
// Tracks feature adoption, usage patterns, milestones, and engagement level.
// Drives engagement workflows and intervention recommendations.
// ---------------------------------------------------------------------------

export const EngagementEventSchema = z.object({
  tenantId: z.string(),
  featureUsed: z.string().optional(),
  milestone: z.string().optional(),
  contactType: z.enum(["email", "call", "meeting"]).optional(),
});

export type EngagementEvent = z.infer<typeof EngagementEventSchema>;

const ENGAGEMENT_LEVELS = {
  INACTIVE: 1,
  MINIMAL: 2,
  MODERATE: 3,
  ACTIVE: 4,
  HIGHLY_ACTIVE: 5,
};

/**
 * Get or create engagement tracker for a tenant.
 */
export async function getOrCreateEngagement(
  tenantId: string,
): Promise<CustomerEngagement> {
  let engagement = await prisma.customerEngagement.findUnique({
    where: { tenantId },
  });

  if (!engagement) {
    engagement = await prisma.customerEngagement.create({
      data: { tenantId },
    });
  }

  return engagement;
}

/**
 * Record a feature usage event.
 */
export async function recordFeatureUsage(
  tenantId: string,
  featureName: string,
): Promise<CustomerEngagement> {
  try {
    const engagement = await getOrCreateEngagement(tenantId);

    const featuresUsed = new Set(engagement.featuresUsed || []);
    featuresUsed.add(featureName);

    // Update login metrics monthly
    const now = new Date();
    const engagement_month_key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const last_recorded_month = engagement.updatedAt
      ? `${engagement.updatedAt.getFullYear()}-${String(engagement.updatedAt.getMonth() + 1).padStart(2, "0")}`
      : null;

    const newLoginCount =
      engagement_month_key !== last_recorded_month
        ? 1
        : (engagement.loginCountMonth ?? 0) + 1;

    const updated = await prisma.customerEngagement.update({
      where: { tenantId },
      data: {
        featuresUsed: Array.from(featuresUsed),
        lastActiveAt: new Date(),
        loginCount: (engagement.loginCount ?? 0) + 1,
        loginCountMonth: newLoginCount,
      },
    });

    logger.debug("Feature usage recorded", {
      tenantId,
      feature: featureName,
      totalFeatures: updated.featuresUsed.length,
    });

    return updated;
  } catch (err) {
    logger.warn("Failed to record feature usage", {
      tenantId,
      error: (err as Error).message,
    });
    throw AppError.internal("Gebruiksregistratie mislukt.");
  }
}

/**
 * Record a milestone achievement (e.g., first successful order, first review).
 */
export async function recordMilestone(
  tenantId: string,
  milestoneName: string,
): Promise<CustomerEngagement> {
  try {
    const engagement = await getOrCreateEngagement(tenantId);

    const milestonesReached = new Set(engagement.milestonesReached || []);
    const isNew = !milestonesReached.has(milestoneName);
    milestonesReached.add(milestoneName);

    const data: any = {
      milestonesReached: Array.from(milestonesReached),
    };

    // Record first success milestone
    if (milestoneName === "first_success" && !engagement.firstSuccessDate) {
      data.firstSuccessDate = new Date();
    }

    const updated = await prisma.customerEngagement.update({
      where: { tenantId },
      data,
    });

    if (isNew) {
      logger.info("Milestone recorded", {
        tenantId,
        milestone: milestoneName,
      });
    }

    return updated;
  } catch (err) {
    logger.warn("Failed to record milestone", {
      tenantId,
      error: (err as Error).message,
    });
    throw AppError.internal("Mijlpaalbewijs mislukt.");
  }
}

/**
 * Calculate engagement level (1-5) based on activity metrics.
 */
function calculateEngagementLevel(engagement: CustomerEngagement): number {
  const loginFrequency = engagement.loginCountMonth ?? 0;
  const featureCount = engagement.featuresUsed?.length ?? 0;
  const daysSinceActive = engagement.lastActiveAt
    ? Math.floor((Date.now() - engagement.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24))
    : 365;

  // Score based on recent activity
  let score = 0;

  // Login frequency (0-2 points)
  if (loginFrequency >= 20) score += 2;
  else if (loginFrequency >= 10) score += 1.5;
  else if (loginFrequency >= 5) score += 1;
  else if (loginFrequency > 0) score += 0.5;

  // Feature adoption (0-2 points)
  if (featureCount >= 10) score += 2;
  else if (featureCount >= 5) score += 1.5;
  else if (featureCount >= 2) score += 1;
  else if (featureCount > 0) score += 0.5;

  // Recency (0-1 point)
  if (daysSinceActive <= 7) score += 1;
  else if (daysSinceActive <= 14) score += 0.5;

  return Math.min(5, Math.max(1, Math.round(score)));
}

/**
 * Update engagement level based on current metrics.
 */
export async function updateEngagementLevel(
  tenantId: string,
): Promise<CustomerEngagement> {
  const engagement = await getOrCreateEngagement(tenantId);
  const level = calculateEngagementLevel(engagement);

  return prisma.customerEngagement.update({
    where: { tenantId },
    data: { engagementLevel: level },
  });
}

/**
 * Record customer contact event.
 */
export async function recordContact(
  tenantId: string,
  type: "email" | "call" | "meeting",
): Promise<CustomerEngagement> {
  const engagement = await getOrCreateEngagement(tenantId);

  return prisma.customerEngagement.update({
    where: { tenantId },
    data: {
      lastContactDate: new Date(),
      ...(type === "email" && { supportTickets: (engagement.supportTickets ?? 0) + 1 }),
    },
  });
}

/**
 * Get engagement summary for a tenant.
 */
export async function getEngagementSummary(tenantId: string): Promise<{
  engagement: CustomerEngagement;
  level_name: string;
  days_since_active: number;
  feature_count: number;
  milestone_count: number;
}> {
  const engagement = await getOrCreateEngagement(tenantId);

  const levelName = [
    "Inactive",
    "Minimal",
    "Moderate",
    "Active",
    "Highly Active",
  ][Math.min(4, Math.max(0, engagement.engagementLevel - 1))] || "Unknown";

  const daysSinceActive = engagement.lastActiveAt
    ? Math.floor((Date.now() - engagement.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  return {
    engagement,
    level_name: levelName,
    days_since_active: daysSinceActive,
    feature_count: engagement.featuresUsed?.length ?? 0,
    milestone_count: engagement.milestonesReached?.length ?? 0,
  };
}

/**
 * Get lowest engagement tenants for outreach.
 */
export async function getLowestEngagementTenants(limit = 20): Promise<CustomerEngagement[]> {
  return prisma.customerEngagement.findMany({
    where: {
      engagementLevel: { lte: 2 },
    },
    orderBy: { engagementLevel: "asc" },
    take: limit,
  });
}
