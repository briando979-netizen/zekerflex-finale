import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { RetentionCampaign } from "@prisma/client";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Subsystem 2: Re-engagement Campaigns
//
// Multi-touch campaign sequences, trigger logic, incentive management,
// and engagement tracking for win-back and reactivation flows.
// ---------------------------------------------------------------------------

export const CampaignSchema = z.object({
  customerId: z.string(),
  type: z.enum(["win_back", "upgrade", "reactivate", "at_risk"]),
  channel: z.enum(["email", "sms", "push", "call"]).default("email"),
  message: z.string().min(10).max(1000),
  subject: z.string().max(200).optional(),
  callToAction: z.string().url().optional(),
  incentiveType: z.enum(["discount", "credit", "feature_unlock", "personal"]).optional(),
  incentiveValue: z.number().int().min(0).optional(),
  sendAfterInactivity: z.number().int().min(0).optional(),
});

export type CampaignInput = z.infer<typeof CampaignSchema>;

const CAMPAIGN_SEQUENCES: Record<string, { delay: number; channel: string; sequence: string }[]> = {
  win_back: [
    { delay: 7, channel: "email", sequence: "1" },   // Initial email
    { delay: 14, channel: "email", sequence: "2" },  // Reminder
    { delay: 21, channel: "sms", sequence: "3" },    // SMS with incentive
  ],
  reactivate: [
    { delay: 3, channel: "email", sequence: "1" },   // Quick followup
    { delay: 7, channel: "push", sequence: "2" },    // App notification
    { delay: 14, channel: "email", sequence: "3" },  // Final reminder
  ],
  upgrade: [
    { delay: 1, channel: "email", sequence: "1" },   // Immediate offer
    { delay: 7, channel: "push", sequence: "2" },    // Reminder
    { delay: 14, channel: "email", sequence: "3" },  // Last chance
  ],
  at_risk: [
    { delay: 2, channel: "email", sequence: "1" },   // Concern message
    { delay: 5, channel: "call", sequence: "2" },    // Personal outreach
    { delay: 10, channel: "email", sequence: "3" },  // Retention offer
  ],
};

/**
 * Create a new campaign.
 */
export async function createCampaign(input: CampaignInput): Promise<RetentionCampaign> {
  try {
    const validated = CampaignSchema.parse(input);

    const campaign = await prisma.retentionCampaign.create({
      data: {
        customerId: validated.customerId,
        type: validated.type,
        channel: validated.channel,
        name: `${validated.type}-${new Date().toISOString().split("T")[0]}`,
        message: validated.message,
        subject: validated.subject,
        callToAction: validated.callToAction ?? null,
        incentiveType: validated.incentiveType ?? null,
        incentiveValue: validated.incentiveValue ?? null,
        incentiveExpiresAt: validated.incentiveValue ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
        sequence: "1",
        sendAfterInactivity: validated.sendAfterInactivity ?? 0,
      },
    });

    logger.info("Campaign created", {
      campaignId: campaign.id,
      customerId: validated.customerId,
      type: validated.type,
    });

    return campaign;
  } catch (err) {
    logger.error("Failed to create campaign", {
      error: (err as Error).message,
    });
    throw AppError.validation("Campagneopstelling mislukt.");
  }
}

/**
 * Get campaign sequences for a campaign type.
 */
export function getCampaignSequences(
  type: "win_back" | "upgrade" | "reactivate" | "at_risk",
): typeof CAMPAIGN_SEQUENCES[keyof typeof CAMPAIGN_SEQUENCES] {
  return CAMPAIGN_SEQUENCES[type] ?? [];
}

/**
 * Schedule campaign sequences for a customer.
 */
export async function scheduleCampaignSequence(
  customerId: string,
  type: "win_back" | "upgrade" | "reactivate" | "at_risk",
  message: string,
  incentive?: { type: string; value: number },
): Promise<RetentionCampaign[]> {
  try {
    const sequences = getCampaignSequences(type);
    const campaigns: RetentionCampaign[] = [];

    for (const seq of sequences) {
      const scheduledFor = new Date(Date.now() + seq.delay * 24 * 60 * 60 * 1000);

      const campaign = await prisma.retentionCampaign.create({
        data: {
          customerId,
          type,
          channel: seq.channel as "email" | "sms" | "push" | "call",
          sequence: seq.sequence,
          name: `${type}-${seq.sequence}`,
          message,
          scheduledFor,
          incentiveType: incentive?.type ?? null,
          incentiveValue: incentive?.value ?? null,
          incentiveExpiresAt: incentive ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
        },
      });

      campaigns.push(campaign);
    }

    logger.info("Campaign sequence scheduled", {
      customerId,
      type,
      count: campaigns.length,
    });

    return campaigns;
  } catch (err) {
    logger.error("Failed to schedule campaign sequence", {
      error: (err as Error).message,
    });
    throw AppError.internal("Campagnescheduling mislukt.");
  }
}

/**
 * Get pending campaigns ready to send.
 */
export async function getPendingCampaigns(limit = 100): Promise<RetentionCampaign[]> {
  const now = new Date();

  return prisma.retentionCampaign.findMany({
    where: {
      status: "active",
      scheduledFor: { lte: now },
      sentAt: null,
      attemptCount: { lt: 3 },
    },
    orderBy: { scheduledFor: "asc" },
    take: limit,
  });
}

/**
 * Mark campaign as sent.
 */
export async function markCampaignSent(campaignId: string): Promise<RetentionCampaign> {
  return prisma.retentionCampaign.update({
    where: { id: campaignId },
    data: {
      sentAt: new Date(),
      attemptCount: { increment: 1 },
    },
  });
}

/**
 * Record campaign engagement (open, click, conversion).
 */
export async function recordCampaignEngagement(
  campaignId: string,
  action: "opened" | "clicked" | "converted",
): Promise<RetentionCampaign> {
  const data: Record<string, Date | boolean> = {};

  if (action === "opened") data.openedAt = new Date();
  else if (action === "clicked") data.clickedAt = new Date();
  else if (action === "converted") {
    data.convertedAt = new Date();
    data.status = "completed";
  }

  return prisma.retentionCampaign.update({
    where: { id: campaignId },
    data,
  });
}

/**
 * Get campaign performance metrics.
 */
export async function getCampaignMetrics(customerId: string): Promise<{
  total_sent: number;
  total_opened: number;
  total_clicked: number;
  total_converted: number;
  open_rate: number;
  click_rate: number;
  conversion_rate: number;
}> {
  const campaigns = await prisma.retentionCampaign.findMany({
    where: {
      customerId,
      sentAt: { not: null },
    },
  });

  const sent = campaigns.length;
  const opened = campaigns.filter((c) => c.openedAt).length;
  const clicked = campaigns.filter((c) => c.clickedAt).length;
  const converted = campaigns.filter((c) => c.convertedAt).length;

  return {
    total_sent: sent,
    total_opened: opened,
    total_clicked: clicked,
    total_converted: converted,
    open_rate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
    click_rate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
    conversion_rate: sent > 0 ? Math.round((converted / sent) * 100) : 0,
  };
}

/**
 * Pause campaigns for a customer.
 */
export async function pauseCampaigns(customerId: string): Promise<number> {
  const result = await prisma.retentionCampaign.updateMany({
    where: {
      customerId,
      status: "active",
    },
    data: {
      status: "paused",
    },
  });

  logger.info("Campaigns paused", {
    customerId,
    count: result.count,
  });

  return result.count;
}

/**
 * Resume campaigns for a customer.
 */
export async function resumeCampaigns(customerId: string): Promise<number> {
  const result = await prisma.retentionCampaign.updateMany({
    where: {
      customerId,
      status: "paused",
    },
    data: {
      status: "active",
    },
  });

  return result.count;
}

/**
 * Generate campaign report by type.
 */
export async function generateCampaignReport(): Promise<{
  by_type: Record<string, { sent: number; open_rate: number; click_rate: number; conversion_rate: number }>;
  by_channel: Record<string, { sent: number; open_rate: number }>;
  total_revenue_generated: number;
}> {
  const campaigns = await prisma.retentionCampaign.findMany();

  const byType: Record<string, any> = {};
  const byChannel: Record<string, any> = {};
  let totalRevenue = 0;

  for (const campaign of campaigns) {
    if (!byType[campaign.type]) {
      byType[campaign.type] = { sent: 0, opened: 0, clicked: 0, converted: 0 };
    }
    if (!byChannel[campaign.channel]) {
      byChannel[campaign.channel] = { sent: 0, opened: 0 };
    }

    if (campaign.sentAt) {
      byType[campaign.type].sent += 1;
      byChannel[campaign.channel].sent += 1;

      if (campaign.openedAt) {
        byType[campaign.type].opened += 1;
        byChannel[campaign.channel].opened += 1;
      }
      if (campaign.clickedAt) byType[campaign.type].clicked += 1;
      if (campaign.convertedAt) {
        byType[campaign.type].converted += 1;
        totalRevenue += campaign.incentiveValue ?? 0;
      }
    }
  }

  // Calculate rates
  const typeReport: Record<string, any> = {};
  for (const [type, data] of Object.entries(byType)) {
    typeReport[type] = {
      sent: data.sent,
      open_rate: data.sent > 0 ? Math.round((data.opened / data.sent) * 100) : 0,
      click_rate: data.sent > 0 ? Math.round((data.clicked / data.sent) * 100) : 0,
      conversion_rate: data.sent > 0 ? Math.round((data.converted / data.sent) * 100) : 0,
    };
  }

  const channelReport: Record<string, any> = {};
  for (const [channel, data] of Object.entries(byChannel)) {
    channelReport[channel] = {
      sent: data.sent,
      open_rate: data.sent > 0 ? Math.round((data.opened / data.sent) * 100) : 0,
    };
  }

  return {
    by_type: typeReport,
    by_channel: channelReport,
    total_revenue_generated: totalRevenue,
  };
}
