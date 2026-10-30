// ---------------------------------------------------------------------------
// SaaS-abonnementen voor bedrijven die ZEKERFLEX ZELF gebruiken (los van de
// API-plannen in lib/api-plans en los van /voor-bureaus voor resellers). Deze
// tiers ontsluiten modules; de maandincasso loopt via de bestaande Stripe-
// subscription-checkout (lib/billing/stripe.ts createSubscriptionCheckoutSession).
// Prijzen zijn startpunten — pas gerust aan; er zijn geen Stripe-price-id's nodig
// (de checkout gebruikt inline price_data uit priceCentsPerMonth).
// ---------------------------------------------------------------------------

export const SAAS_PLAN_KEYS = ["starter", "pro", "business", "enterprise"] as const;
export type SaasPlanKey = (typeof SAAS_PLAN_KEYS)[number];

export interface SaasPlan {
  key: SaasPlanKey;
  label: string;
  tagline: string;
  priceCentsPerMonth: number | null; // null = op aanvraag (geen self-service)
  selfService: boolean;
  features: string[];
  entitlements: string[]; // module-sleutels; "*" = alles
}

export const SAAS_PLANS: Record<SaasPlanKey, SaasPlan> = {
  starter: {
    key: "starter",
    label: "Starter",
    tagline: "Gratis starten — je betaalt alleen de €3,50/uur bij gebruik.",
    priceCentsPerMonth: 0,
    selfService: true,
    features: ["Marktplaats & automatische matching", "Reageren en inplannen", "Chat, uren en facturen"],
    entitlements: ["marketplace", "matching"],
  },
  pro: {
    key: "pro",
    label: "Pro",
    tagline: "Voor actieve inhuurders die sneller willen werven en uitbetalen.",
    priceCentsPerMonth: 149_00,
    selfService: true,
    features: ["Alles uit Starter", "AI-recruiter (sourcen + concept-berichten)", "Snelle uitbetaling / factoring", "Verkeer & analytics"],
    entitlements: ["marketplace", "matching", "recruiter", "fastpay", "analytics"],
  },
  business: {
    key: "business",
    label: "Business",
    tagline: "Voor uitzend & detachering met loonadministratie en bank.",
    priceCentsPerMonth: 399_00,
    selfService: true,
    features: ["Alles uit Pro", "Uitzend: ABU-fasen + StiPP-pensioenaangifte", "ZekerFlex Bank (kaarten & uitbetalingen)", "Prioriteit-support"],
    entitlements: ["marketplace", "matching", "recruiter", "fastpay", "analytics", "uitzend", "bank"],
  },
  enterprise: {
    key: "enterprise",
    label: "Enterprise",
    tagline: "Voor multi-vestiging of white-label — op maat.",
    priceCentsPerMonth: null,
    selfService: false,
    features: ["Alles uit Business", "Eigen merk / white-label", "SSO & SLA", "Maatwerk en onboarding"],
    entitlements: ["*"],
  },
};

export function saasPlan(key: string): SaasPlan | null {
  return (SAAS_PLAN_KEYS as readonly string[]).includes(key) ? SAAS_PLANS[key as SaasPlanKey] : null;
}

export function isSaasPlanKey(key: string): key is SaasPlanKey {
  return (SAAS_PLAN_KEYS as readonly string[]).includes(key);
}

/** Heeft een plan toegang tot een module-sleutel? "*" = alles. */
export function saasPlanIncludes(key: string, entitlement: string): boolean {
  const plan = saasPlan(key);
  if (!plan) return false;
  return plan.entitlements.includes("*") || plan.entitlements.includes(entitlement);
}
