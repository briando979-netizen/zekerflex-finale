import { listActiveCampaigns } from "./campaigns";
import { listActiveDeals } from "./deals";
import type { MarketingPosition } from "./index";

export interface MarketingContent {
  type: "campaign" | "deal";
  id: string;
  title: string;
  description?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  cta: string;
  href: string;
  position: MarketingPosition;
  priority: number;
}

export async function getMarketingContent(
  position: MarketingPosition,
  audience: string = "ALL"
): Promise<MarketingContent[]> {
  const campaigns = await listActiveCampaigns();
  const deals = await listActiveDeals();

  const content: MarketingContent[] = [];

  // Filter campaigns by position and audience
  campaigns
    .filter(
      (c) =>
        c.targetAudience === "ALL" || c.targetAudience === audience
    )
    .forEach((c) => {
      if (shouldShowInPosition(c.type, position)) {
        content.push({
          type: "campaign",
          id: c.id,
          title: c.title,
          description: c.description || undefined,
          videoUrl: c.videoUrl || undefined,
          thumbnailUrl: c.thumbnailUrl || undefined,
          cta: "Bekijk",
          href: `/campaigns/${c.id}`,
          position,
          priority: getPriority(c.type),
        });
      }
    });

  // Filter deals by position and audience
  deals
    .filter(
      (d) =>
        d.targetAudience === "ALL" || d.targetAudience === audience
    )
    .forEach((d) => {
      if (shouldShowInPosition("PROMOTIONAL", position)) {
        content.push({
          type: "deal",
          id: d.id,
          title: d.title,
          description: d.description || undefined,
          videoUrl: d.videoUrl || undefined,
          thumbnailUrl: d.thumbnailUrl || undefined,
          cta: `${d.discountValue}% korting`,
          href: `/deals/${d.id}`,
          position,
          priority: getPriority("PROMOTIONAL"),
        });
      }
    });

  return content.sort((a, b) => b.priority - a.priority).slice(0, 5);
}

function shouldShowInPosition(
  contentType: string,
  position: MarketingPosition
): boolean {
  const positions: Record<string, MarketingPosition[]> = {
    PROMOTIONAL: [
      "hero",
      "dashboard",
      "pricing",
      "popup",
      "email",
      "notification",
    ],
    SEASONAL: ["hero", "homepage", "email"],
    FEATURED: ["dashboard", "features", "homepage"],
    SUCCESS_STORY: ["features", "homepage", "footer"],
    TESTIMONIAL: ["pricing", "features", "homepage"],
    NEW_FEATURE: ["dashboard", "email", "notification"],
  };

  return (positions[contentType] || []).includes(position);
}

function getPriority(contentType: string): number {
  const priorities: Record<string, number> = {
    PROMOTIONAL: 5,
    SEASONAL: 4,
    FEATURED: 3,
    SUCCESS_STORY: 2,
    TESTIMONIAL: 1,
    NEW_FEATURE: 4,
  };

  return priorities[contentType] || 1;
}

export async function getHeroContent(): Promise<MarketingContent | null> {
  const content = await getMarketingContent("hero");
  return content[0] || null;
}

export async function getDashboardPromos(
  audience: string
): Promise<MarketingContent[]> {
  return getMarketingContent("dashboard", audience);
}

export async function getPricingPromos(): Promise<MarketingContent[]> {
  return getMarketingContent("pricing");
}

export async function getFeaturePromos(): Promise<MarketingContent[]> {
  return getMarketingContent("features");
}

export async function getFooterPromos(): Promise<MarketingContent[]> {
  return getMarketingContent("footer");
}

export async function getEmailPromos(): Promise<MarketingContent[]> {
  return getMarketingContent("email").then((items) => items.slice(0, 3));
}

export async function getPopupPromos(): Promise<MarketingContent[]> {
  const content = await getMarketingContent("popup");
  return content.slice(0, 1);
}
