// Purchase mode: subscription vs one-time buy
// All products can offer both modes; the customer chooses at checkout.

export type PurchaseMode = "onetime" | "subscription";

export interface PricingModel {
  mode: PurchaseMode;
  label: string;
  pricePerMonthCents?: number; // voor subscription
  priceCents: number; // totaal of eenmalig
  billingCycle?: "monthly" | "annual";
}

export function getPricingOptions(basePriceCents: number): PricingModel[] {
  return [
    {
      mode: "onetime",
      label: "Eenmalig",
      priceCents: basePriceCents,
    },
    {
      mode: "subscription",
      label: "Maandelijks abonnement",
      pricePerMonthCents: Math.round(basePriceCents * 0.15), // ~15% per maand
      priceCents: Math.round(basePriceCents * 0.15),
      billingCycle: "monthly",
    },
  ];
}

export function describeMode(mode: PurchaseMode, monthlyPrice?: number): string {
  if (mode === "subscription" && monthlyPrice !== undefined) {
    return `€ ${(monthlyPrice / 100).toFixed(2)} per maand`;
  }
  return "Eenmalige koop";
}
