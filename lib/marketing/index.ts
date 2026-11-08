export * from "./campaigns";
export * from "./deals";
export * from "./distribution";

// Marketing Automation - 6 subsystems
export * from "./email-campaigns";
export * from "./segmentation";
export * from "./automation-workflows";
export * from "./ab-testing";
export * from "./campaign-analytics";
export * from "./integrations";

export const MARKETING_POSITIONS = {
  HERO: "hero",
  DASHBOARD: "dashboard",
  PRICING: "pricing",
  FEATURES: "features",
  FOOTER: "footer",
  POPUP: "popup",
  EMAIL: "email",
  NOTIFICATION: "notification",
  HOMEPAGE: "homepage",
} as const;

export type MarketingPosition = (typeof MARKETING_POSITIONS)[keyof typeof MARKETING_POSITIONS];

export const DEAL_TIERS = {
  URGENT: "urgent",
  FEATURED: "featured",
  STANDARD: "standard",
  LIMITED: "limited",
} as const;

export type DealTier = (typeof DEAL_TIERS)[keyof typeof DEAL_TIERS];
