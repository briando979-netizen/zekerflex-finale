import { z } from "zod";

export const TIER_CONFIG = {
  FREE: {
    id: "free",
    name: "Free",
    price: 0,
    currency: "EUR",
    features: {
      maxUsers: 1,
      maxProjects: 1,
      analytics: false,
      api: false,
      customDomain: false,
      teamChat: false,
      sso: false,
      supportLevel: "community",
      storageGB: 1,
      apiCallsPerMonth: 0,
    },
    limits: {
      requests_per_minute: 60,
      file_size_mb: 50,
      team_members: 0,
    },
  },
  PRO: {
    id: "pro",
    name: "Pro",
    price: 2900,
    currency: "EUR",
    billingPeriod: "monthly",
    features: {
      maxUsers: 5,
      maxProjects: 10,
      analytics: true,
      api: true,
      customDomain: false,
      teamChat: true,
      sso: false,
      supportLevel: "email",
      storageGB: 100,
      apiCallsPerMonth: 100000,
    },
    limits: {
      requests_per_minute: 300,
      file_size_mb: 500,
      team_members: 5,
    },
  },
  BUSINESS: {
    id: "business",
    name: "Business",
    price: 9900,
    currency: "EUR",
    billingPeriod: "monthly",
    features: {
      maxUsers: 50,
      maxProjects: 100,
      analytics: true,
      api: true,
      customDomain: true,
      teamChat: true,
      sso: true,
      supportLevel: "priority",
      storageGB: 1000,
      apiCallsPerMonth: 1000000,
    },
    limits: {
      requests_per_minute: 1000,
      file_size_mb: 2000,
      team_members: 50,
    },
  },
  ENTERPRISE: {
    id: "enterprise",
    name: "Enterprise",
    price: 0,
    currency: "EUR",
    custom: true,
    features: {
      maxUsers: null,
      maxProjects: null,
      analytics: true,
      api: true,
      customDomain: true,
      teamChat: true,
      sso: true,
      supportLevel: "dedicated",
      storageGB: null,
      apiCallsPerMonth: null,
    },
    limits: {
      requests_per_minute: null,
      file_size_mb: null,
      team_members: null,
    },
  },
};

export const tierSchema = z.enum(["free", "pro", "business", "enterprise"]);
export type Tier = z.infer<typeof tierSchema>;

export function getTierConfig(tier: Tier) {
  const config = TIER_CONFIG[tier as keyof typeof TIER_CONFIG];
  if (!config) throw new Error(`Unknown tier: ${tier}`);
  return config;
}

export function canAccessFeature(tier: Tier, feature: string): boolean {
  const config = getTierConfig(tier);
  return (config.features as Record<string, unknown>)[feature] === true;
}

export function getLimit(tier: Tier, limitKey: string): number | null {
  const config = getTierConfig(tier);
  const limit = (config.limits as Record<string, unknown>)[limitKey];
  return limit === null ? null : (limit as number);
}

export const subscriptionSchema = z.object({
  userId: z.string().uuid(),
  tier: tierSchema,
  stripeSubscriptionId: z.string().optional(),
  currentPeriodStart: z.date(),
  currentPeriodEnd: z.date(),
  cancelAtPeriodEnd: z.boolean().default(false),
  trialEndsAt: z.date().optional(),
  status: z.enum(["active", "past_due", "canceled", "unpaid"]).default("active"),
});

export type Subscription = z.infer<typeof subscriptionSchema>;
