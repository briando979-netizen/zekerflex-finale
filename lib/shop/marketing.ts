// Marketing automation and campaigns

export interface MarketingCampaign {
  id: string;
  name: string;
  type: "email" | "push" | "sms" | "in_app";
  segmentId: string;
  status: "draft" | "scheduled" | "active" | "completed" | "cancelled";
  content: CampaignContent;
  schedule: CampaignSchedule;
  metrics: CampaignMetrics;
  createdAt: Date;
}

export interface CampaignContent {
  subject?: string;
  body: string;
  cta?: { text: string; url: string };
  template?: string;
}

export interface CampaignSchedule {
  sendAt: Date;
  timezone?: string;
  recurring?: "daily" | "weekly" | "monthly";
  endDate?: Date;
}

export interface CampaignMetrics {
  sent: number;
  opened: number;
  clicked: number;
  converted: number;
  revenue: number; // cents
}

export async function createCampaign(data: Partial<MarketingCampaign>): Promise<MarketingCampaign> {
  return {
    id: `campaign_${Date.now()}`,
    name: data.name || "",
    type: data.type || "email",
    segmentId: data.segmentId || "",
    status: "draft",
    content: data.content || { body: "" },
    schedule: data.schedule || { sendAt: new Date() },
    metrics: { sent: 0, opened: 0, clicked: 0, converted: 0, revenue: 0 },
    createdAt: new Date(),
    ...data,
  };
}

export async function scheduleCampaign(campaignId: string, sendAt: Date): Promise<void> {
  // TODO: Schedule in database and trigger at correct time
}

export async function trackCampaignEvent(
  campaignId: string,
  event: "open" | "click" | "convert"
): Promise<void> {
  // TODO: Update metrics
}

export const CAMPAIGN_TEMPLATES = [
  {
    id: "welcome",
    name: "Welcome New Customer",
    body: "Welkom bij onze shop! Hier is 10% korting op je eerste bestelling.",
  },
  {
    id: "abandoned_cart",
    name: "Abandoned Cart Recovery",
    body: "Je hebt iets achtergelaten in je winkelwagen. Maak je bestelling af.",
  },
  {
    id: "post_purchase",
    name: "Post-Purchase Follow-up",
    body: "Bedankt voor je aankoop! Hoe bevalt het product?",
  },
  {
    id: "winback",
    name: "Win-Back Campaign",
    body: "We missen je! Hier is 20% korting om je terug te verwelkomen.",
  },
];
