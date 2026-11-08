import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const featureGatingSchema = z.object({
  tenantId: z.string(),
  featureName: z.string(),
  enabled: z.boolean(),
  limit: z.number().optional(),
  usageThisMonth: z.number().default(0),
  tier: z.enum(["STARTER", "PROFESSIONAL", "ENTERPRISE"]),
});

export const FEATURE_LIMITS = {
  STARTER: {
    users: 5,
    projects: 3,
    storage: 10, // GB
    apiCalls: 10000,
  },
  PROFESSIONAL: {
    users: 50,
    projects: 20,
    storage: 100, // GB
    apiCalls: 100000,
  },
  ENTERPRISE: {
    users: Infinity,
    projects: Infinity,
    storage: Infinity,
    apiCalls: Infinity,
  },
};

export const FEATURE_TIER_MAPPING: Record<string, string[]> = {
  STARTER: ["basic", "dashboard", "reports"],
  PROFESSIONAL: ["basic", "dashboard", "reports", "api", "automation", "integrations"],
  ENTERPRISE: ["basic", "dashboard", "reports", "api", "automation", "integrations", "white-label", "sso", "custom-domains"],
};

export async function isFeatureEnabled(tenantId: string, featureName: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) return false;

  const allowedFeatures = FEATURE_TIER_MAPPING[tenant.plan] || [];
  return allowedFeatures.includes(featureName);
}

export async function getFeatureLimit(tenantId: string, feature: keyof typeof FEATURE_LIMITS.STARTER) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) return 0;

  return FEATURE_LIMITS[tenant.plan as keyof typeof FEATURE_LIMITS]?.[feature] ?? 0;
}

export async function checkUsageLimit(
  tenantId: string,
  feature: keyof typeof FEATURE_LIMITS.STARTER
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limit = await getFeatureLimit(tenantId, feature);

  // In production, would fetch actual usage
  const current = 0; // TODO: implement usage tracking

  return {
    allowed: current < limit,
    current,
    limit,
  };
}

export async function incrementUsage(tenantId: string, feature: string) {
  // Increment usage counter for the month
  const key = `usage:${tenantId}:${feature}:${new Date().toISOString().split("T")[0]}`;

  // In production, would use Redis or database
  return { success: true };
}

export async function getTrialDaysRemaining(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant || tenant.status !== "TRIAL") return 0;

  const trialStart = tenant.createdAt;
  const trialEnd = new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000);
  const now = new Date();

  return Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

export async function upgradePlan(tenantId: string, newPlan: "STARTER" | "PROFESSIONAL" | "ENTERPRISE") {
  return await prisma.tenant.update({
    where: { id: tenantId },
    data: { plan: newPlan },
  });
}

export async function trackFeatureUsage(tenantId: string, feature: string, count: number = 1) {
  await incrementUsage(tenantId, feature);

  return {
    success: true,
    feature,
    count,
  };
}
