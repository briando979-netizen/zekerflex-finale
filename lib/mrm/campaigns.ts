import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

// ============================================================================
// 1. CAMPAIGN MANAGEMENT - Multi-channel campaigns, orchestration, scheduling
// ============================================================================

const CreateCampaignSchema = z.object({
  name: z.string().min(1, "Campagnenaam is verplicht"),
  description: z.string().optional(),
  type: z.enum(["EMAIL", "SOCIAL", "CONTENT", "PAID_ADS", "WEBINAR", "MULTI_CHANNEL"]),
  channels: z.array(z.string()).min(1, "Ten minste één kanaal is verplicht"),
  scheduledStart: z.string().datetime().optional(),
  scheduledEnd: z.string().datetime().optional(),
  budget: z.number().positive("Budget moet positief zijn"),
});

const UpdateCampaignSchema = CreateCampaignSchema.partial();

export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;

/**
 * Create a new marketing campaign
 */
export async function createCampaign(
  tenantId: string,
  input: CreateCampaignInput,
) {
  const validated = CreateCampaignSchema.parse(input);

  if (validated.scheduledStart && validated.scheduledEnd) {
    if (new Date(validated.scheduledStart) >= new Date(validated.scheduledEnd)) {
      throw AppError.validation("Startdatum moet voor einddatum liggen");
    }
  }

  return prisma.mrmCampaign.create({
    data: {
      tenantId,
      name: validated.name,
      description: validated.description,
      type: validated.type,
      channels: validated.channels,
      scheduledStart: validated.scheduledStart ? new Date(validated.scheduledStart) : null,
      scheduledEnd: validated.scheduledEnd ? new Date(validated.scheduledEnd) : null,
      budget: Math.round(validated.budget * 100), // Store as cents
    },
  });
}

/**
 * Get campaigns for a tenant
 */
export async function getCampaigns(
  tenantId: string,
  filters?: {
    status?: string;
    type?: string;
    limit?: number;
    offset?: number;
  },
) {
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;

  const where: any = { tenantId };
  if (filters?.status) where.status = filters.status;
  if (filters?.type) where.type = filters.type;

  const [campaigns, total] = await Promise.all([
    prisma.mrmCampaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        assets: { take: 5 },
        budgetLines: true,
      },
    }),
    prisma.mrmCampaign.count({ where }),
  ]);

  return { campaigns, total, limit, offset };
}

/**
 * Get a single campaign by ID
 */
export async function getCampaignById(id: string, tenantId: string) {
  const campaign = await prisma.mrmCampaign.findFirst({
    where: { id, tenantId },
    include: {
      assets: true,
      automations: true,
      budgetLines: true,
      attributionData: true,
    },
  });

  if (!campaign) {
    throw AppError.notFound("Campagne niet gevonden");
  }

  return campaign;
}

/**
 * Update a campaign
 */
export async function updateCampaign(
  id: string,
  tenantId: string,
  input: UpdateCampaignInput,
) {
  const validated = UpdateCampaignSchema.parse(input);

  // Verify campaign exists and belongs to tenant
  const existing = await prisma.mrmCampaign.findFirst({
    where: { id, tenantId },
  });

  if (!existing) {
    throw AppError.notFound("Campagne niet gevonden");
  }

  if (validated.scheduledStart && validated.scheduledEnd) {
    if (new Date(validated.scheduledStart) >= new Date(validated.scheduledEnd)) {
      throw AppError.validation("Startdatum moet voor einddatum liggen");
    }
  }

  return prisma.mrmCampaign.update({
    where: { id },
    data: {
      ...(validated.name !== undefined && { name: validated.name }),
      ...(validated.description !== undefined && { description: validated.description }),
      ...(validated.type !== undefined && { type: validated.type }),
      ...(validated.channels !== undefined && { channels: validated.channels }),
      ...(validated.scheduledStart && { scheduledStart: new Date(validated.scheduledStart) }),
      ...(validated.scheduledEnd && { scheduledEnd: new Date(validated.scheduledEnd) }),
      ...(validated.budget !== undefined && { budget: Math.round(validated.budget * 100) }),
    },
  });
}

/**
 * Update campaign status
 */
export async function updateCampaignStatus(
  id: string,
  tenantId: string,
  status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED",
) {
  const campaign = await prisma.mrmCampaign.findFirst({
    where: { id, tenantId },
  });

  if (!campaign) {
    throw AppError.notFound("Campagne niet gevonden");
  }

  return prisma.mrmCampaign.update({
    where: { id },
    data: { status },
  });
}

/**
 * Track campaign performance metrics
 */
export async function trackCampaignPerformance(
  id: string,
  tenantId: string,
  metrics: {
    impressions?: number;
    clicks?: number;
    conversions?: number;
    spend?: number;
  },
) {
  const campaign = await prisma.mrmCampaign.findFirst({
    where: { id, tenantId },
  });

  if (!campaign) {
    throw AppError.notFound("Campagne niet gevonden");
  }

  // Calculate ROI
  const spend = metrics.spend ?? campaign.spend;
  const expectedReturn = campaign.budget / 100; // Convert back from cents
  const roi = spend > 0 ? ((expectedReturn - spend) / spend) * 100 : 0;

  return prisma.mrmCampaign.update({
    where: { id },
    data: {
      ...(metrics.impressions !== undefined && {
        impressions: { increment: metrics.impressions },
      }),
      ...(metrics.clicks !== undefined && {
        clicks: { increment: metrics.clicks },
      }),
      ...(metrics.conversions !== undefined && {
        conversions: { increment: metrics.conversions },
      }),
      ...(metrics.spend !== undefined && {
        spend: campaign.spend + metrics.spend,
      }),
      roi,
    },
  });
}

/**
 * Delete a campaign (archive instead of hard delete)
 */
export async function deleteCampaign(id: string, tenantId: string) {
  const campaign = await prisma.mrmCampaign.findFirst({
    where: { id, tenantId },
  });

  if (!campaign) {
    throw AppError.notFound("Campagne niet gevonden");
  }

  return prisma.mrmCampaign.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });
}
