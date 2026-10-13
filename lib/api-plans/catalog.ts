import type { ApiScope } from "@/lib/integrations/api-keys";

// ---------------------------------------------------------------------------
// Pricing tiers for the public partner API. Plain code constants — same
// pattern as PLATFORM_FEE_PER_HOUR_CENTS in lib/env.ts — rather than a
// database price table, since there's no self-service price editing UI and
// Stripe Checkout builds its line item from price_data inline (no
// pre-created Stripe Product/Price needed). Adjust the numbers here; nothing
// else needs to change for a price update.
// ---------------------------------------------------------------------------

export const PLAN_KEYS = ["free", "starter", "pro", "scale"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface ApiPlan {
  key: PlanKey;
  label: string;
  priceCentsPerMonth: number | null; // null = "contact sales", no self-service Checkout
  rateLimitPerMinute: number;
  monthlyRequestCap: number | null; // null = uncapped (scale plan, negotiated)
  scopes: ApiScope[];
  selfService: boolean; // can be bought/activated via Stripe Checkout without talking to sales
}

export const API_PLANS: Record<PlanKey, ApiPlan> = {
  free: {
    key: "free",
    label: "Free",
    priceCentsPerMonth: 0,
    rateLimitPerMinute: 60,
    monthlyRequestCap: 10_000,
    scopes: ["shifts:read", "timesheets:read"],
    selfService: true,
  },
  starter: {
    key: "starter",
    label: "Starter",
    priceCentsPerMonth: 49_00,
    rateLimitPerMinute: 300,
    monthlyRequestCap: 100_000,
    scopes: ["shifts:read", "shifts:write", "timesheets:read", "webhooks:manage"],
    selfService: true,
  },
  pro: {
    key: "pro",
    label: "Pro",
    priceCentsPerMonth: 199_00,
    rateLimitPerMinute: 1200,
    monthlyRequestCap: 1_000_000,
    scopes: ["shifts:read", "shifts:write", "timesheets:read", "webhooks:manage", "invoices:read", "users:read"],
    selfService: true,
  },
  scale: {
    key: "scale",
    label: "Scale",
    priceCentsPerMonth: null,
    rateLimitPerMinute: 1200,
    monthlyRequestCap: null,
    scopes: ["shifts:read", "shifts:write", "timesheets:read", "webhooks:manage", "invoices:read", "users:read"],
    selfService: false,
  },
};

export function isPlanKey(value: string): value is PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(value);
}

export function getPlan(planKey: string | null | undefined): ApiPlan {
  if (planKey && isPlanKey(planKey)) return API_PLANS[planKey];
  return API_PLANS.free;
}

export const FREE_PLAN = API_PLANS.free;
