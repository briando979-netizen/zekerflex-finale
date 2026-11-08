import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

/**
 * Feature Gating - Per-tenant feature flags, usage limits, tier-based access, capability management
 */

const featureFlagSchema = z.object({
  featureKey: z.string().min(1),
  enabled: z.boolean().default(false),
  percentage: z.number().int().min(0).max(100).optional(),
  value: z.string().optional(),
});

export type FeatureFlagConfig = z.infer<typeof featureFlagSchema>;

/**
 * Tier-based feature access mapping
 */
export const TIER_FEATURES: Record<string, string[]> = {
  STARTER: [
    "basic_dashboard",
    "api_access",
    "basic_analytics",
  ],
  PROFESSIONAL: [
    "basic_dashboard",
    "api_access",
    "advanced_analytics",
    "custom_branding",
    "sso",
    "webhooks",
  ],
  ENTERPRISE: [
    "basic_dashboard",
    "api_access",
    "advanced_analytics",
    "custom_branding",
    "sso",
    "webhooks",
    "dedicated_support",
    "custom_integrations",
    "data_residency_choice",
    "advanced_security",
  ],
  CUSTOM: [] as string[], // Determined per-tenant
};

/**
 * Set a feature flag for a tenant or platform-wide
 */
export async function setFeatureFlag(
  featureKey: string,
  enabled: boolean,
  options?: {
    tenantId?: string;
    percentage?: number;
    value?: string;
  }
) {
  const validated = featureFlagSchema.parse({
    featureKey,
    enabled,
    percentage: options?.percentage,
    value: options?.value,
  });

  return await prisma.featureFlag.upsert({
    where: {
      tenantId_featureKey: {
        tenantId: options?.tenantId ?? null,
        featureKey,
      },
    },
    update: validated,
    create: {
      tenantId: options?.tenantId,
      ...validated,
    },
  });
}

/**
 * Check if a feature is enabled for a tenant
 */
export async function isFeatureEnabled(
  tenantId: string,
  featureKey: string
): Promise<boolean> {
  const flag = await prisma.featureFlag.findUnique({
    where: {
      tenantId_featureKey: {
        tenantId,
        featureKey,
      },
    },
  });

  // Fall back to platform-wide flag if tenant flag not found
  if (!flag) {
    const platformFlag = await prisma.featureFlag.findUnique({
      where: {
        tenantId_featureKey: {
          tenantId: null,
          featureKey,
        },
      },
    });

    return platformFlag?.enabled ?? false;
  }

  // Check percentage-based rollout
  if (flag.percentage !== null && flag.percentage !== undefined) {
    return isUserInPercentile(tenantId, featureKey, flag.percentage);
  }

  return flag.enabled;
}

/**
 * Get all features enabled for a tenant
 */
export async function getTenantFeatures(tenantId: string): Promise<Record<string, boolean>> {
  const flags = await prisma.featureFlag.findMany({
    where: { tenantId },
  });

  const features: Record<string, boolean> = {};
  for (const flag of flags) {
    features[flag.featureKey] = flag.enabled;
  }

  return features;
}

/**
 * Enable features based on tenant tier
 */
export async function enableTierFeatures(tenantId: string, tier: "STARTER" | "PROFESSIONAL" | "ENTERPRISE" | "CUSTOM") {
  const features = TIER_FEATURES[tier] ?? [];

  // Batch upsert features for this tenant
  for (const feature of features) {
    await setFeatureFlag(feature, true, { tenantId });
  }

  return features;
}

/**
 * Get feature flag value for customization
 */
export async function getFeatureFlagValue(
  tenantId: string,
  featureKey: string
): Promise<string | null> {
  const flag = await prisma.featureFlag.findUnique({
    where: {
      tenantId_featureKey: {
        tenantId,
        featureKey,
      },
    },
  });

  if (!flag?.value) {
    const platformFlag = await prisma.featureFlag.findUnique({
      where: {
        tenantId_featureKey: {
          tenantId: null,
          featureKey,
        },
      },
    });

    return platformFlag?.value ?? null;
  }

  return flag.value;
}

/**
 * Disable a feature for a tenant
 */
export async function disableFeature(tenantId: string, featureKey: string) {
  return await prisma.featureFlag.update({
    where: {
      tenantId_featureKey: {
        tenantId,
        featureKey,
      },
    },
    data: { enabled: false },
  });
}

/**
 * Set percentage-based rollout for a feature
 */
export async function setFeatureRollout(
  tenantId: string,
  featureKey: string,
  percentage: number
) {
  if (percentage < 0 || percentage > 100) {
    throw AppError.validation("Percentage moet tussen 0 en 100 liggen");
  }

  return await prisma.featureFlag.upsert({
    where: {
      tenantId_featureKey: {
        tenantId,
        featureKey,
      },
    },
    update: { percentage },
    create: {
      tenantId,
      featureKey,
      enabled: true,
      percentage,
    },
  });
}

// ============================================================================
// Helpers
// ============================================================================

function isUserInPercentile(tenantId: string, featureKey: string, percentage: number): boolean {
  // Use deterministic hash of tenant+feature to determine if in percentile
  const crypto = require("crypto");
  const hash = crypto.createHash("sha256").update(`${tenantId}:${featureKey}`).digest("hex");
  const hashValue = parseInt(hash.substring(0, 8), 16);
  const threshold = (percentage / 100) * 0xffffffff;

  return hashValue < threshold;
}
