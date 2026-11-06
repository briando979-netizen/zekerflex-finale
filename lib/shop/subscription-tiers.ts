// Subscription tier management — upgrade/downgrade paths

export type TierLevel = "starter" | "growth" | "pro";

export interface SubscriptionTier {
  id: TierLevel;
  name: string;
  description: string;
  monthlyPriceCents: number;
  features: string[];
  maxOrders?: number;
  maxStorage?: number; // in MB
  supportLevel: "email" | "priority" | "dedicated";
}

export const SUBSCRIPTION_TIERS: Record<TierLevel, SubscriptionTier> = {
  starter: {
    id: "starter",
    name: "Starter",
    description: "Voor individuele kopers",
    monthlyPriceCents: 0,
    features: ["Onbeperkte aankopen", "Standaard verzending", "Email support"],
    supportLevel: "email",
  },
  growth: {
    id: "growth",
    name: "Growth",
    description: "Voor regelmatige klanten",
    monthlyPriceCents: 999, // €9,99/month
    features: [
      "Alles uit Starter",
      "Gratis verzending (>€20)",
      "Vroege toegang tot sales",
      "Priority support",
    ],
    supportLevel: "priority",
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Voor bedrijven",
    monthlyPriceCents: 2999, // €29,99/month
    features: [
      "Alles uit Growth",
      "Gratis verzending (altijd)",
      "Business invoicing",
      "Dedicated account manager",
      "Bulk discounts",
    ],
    supportLevel: "dedicated",
  },
};

export interface UpgradePath {
  from: TierLevel;
  to: TierLevel;
  proration: "immediate" | "next_billing"; // how to handle mid-cycle upgrade
}

export function getAvailableUpgrades(currentTier: TierLevel): TierLevel[] {
  const order: TierLevel[] = ["starter", "growth", "pro"];
  const currentIndex = order.indexOf(currentTier);
  return order.slice(currentIndex + 1);
}

export function calculateUpgradeProration(
  fromTier: SubscriptionTier,
  toTier: SubscriptionTier,
  daysUsed: number,
  daysInMonth: number
): number {
  // Credit for used days on old tier
  const creditCents = Math.round((fromTier.monthlyPriceCents * daysUsed) / daysInMonth);
  // Charge for new tier
  const newChargeCents = toTier.monthlyPriceCents;
  return newChargeCents - creditCents;
}
