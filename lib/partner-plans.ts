// ---------------------------------------------------------------------------
// Verkoop van ZekerFlex aan ANDERE bureaus — als losse plugin (één module via
// de API), als white-label platform, of volledig self-hosted op eigen infra.
// Dit is de verkoop-catalogus voor /voor-bureaus. Prijzen zijn INDICATIEVE
// startprijzen (definitief altijd in overleg) — pas ze gerust aan. De
// `entitlements` zijn module-sleutels voor latere toegang-gating per afnemer.
// ---------------------------------------------------------------------------

export type PartnerBilling = "per-module" | "platform" | "self-hosted";

export interface PartnerPlan {
  id: string;
  name: string;
  tagline: string;
  priceLabel: string; // "vanaf € … /mnd" of "op aanvraag"
  billing: PartnerBilling;
  featured: boolean;
  features: string[];
  entitlements: string[]; // module-sleutels; "*" = alles
  ctaLabel: string;
}

export const PARTNER_PLANS: PartnerPlan[] = [
  {
    id: "plugin",
    name: "Plugin",
    tagline: "Koppel één ZekerFlex-module aan je eigen systeem via de API.",
    priceLabel: "vanaf € 149 /mnd per module",
    billing: "per-module",
    featured: false,
    features: [
      "Eén module naar keuze: AI-recruiter, matching, uren→facturen of de webshop",
      "Volledige REST-API + webhooks + OpenAPI-spec (/developers)",
      "API-sleutels met scopes, rate-limits en rotatie",
      "Draait op onze infra — jij koppelt alleen",
    ],
    entitlements: ["api"],
    ctaLabel: "Plugin aanvragen",
  },
  {
    id: "platform",
    name: "Platform (white-label)",
    tagline: "Het hele ZekerFlex-platform onder je eigen merk voor jouw bureau.",
    priceLabel: "vanaf € 499 /mnd",
    billing: "platform",
    featured: true,
    features: [
      "Eigen merk, kleuren en subdomein (huisstijl runtime instelbaar)",
      "Alle modules: AI-recruiter, matching, uren & facturen, uitzend (ABU/StiPP), webshop",
      "Eigen opdrachtgevers, freelancers en uitzendkrachten in je eigen omgeving",
      "AI op onze self-hoste modellen — geen kosten per intake of per beeld",
      "Toegang per module instelbaar via feature-flags",
    ],
    entitlements: ["recruiter", "matching", "billing", "uitzend", "webshop", "api"],
    ctaLabel: "Demo aanvragen",
  },
  {
    id: "soeverein",
    name: "Soeverein (self-hosted)",
    tagline: "Alles op je eigen infrastructuur — afhankelijk van niemand.",
    priceLabel: "op aanvraag",
    billing: "self-hosted",
    featured: false,
    features: [
      "Volledige stack op je eigen VPS (deploy/-recepten: app, DNS, mail, Redis, AI, beeld)",
      "Eigen taal- en beeldmodel (Ollama + Stable Diffusion) — geen vendor-credits",
      "Eigen tunnel + sandbox, eigen data, eigen sleutels",
      "Maatwerk, onboarding en SLA",
    ],
    entitlements: ["*"],
    ctaLabel: "Neem contact op",
  },
];

export function partnerPlan(id: string): PartnerPlan | undefined {
  return PARTNER_PLANS.find((p) => p.id === id);
}

/** Heeft een pakket toegang tot een module-sleutel? "*" = alles. */
export function planIncludes(planId: string, entitlement: string): boolean {
  const plan = partnerPlan(planId);
  if (!plan) return false;
  return plan.entitlements.includes("*") || plan.entitlements.includes(entitlement);
}
