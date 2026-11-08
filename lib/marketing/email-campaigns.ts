import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

// Schema voor email campagnes met volledige mogelijkheden
const campaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  templateId: z.string(),
  listId: z.string().optional(),
  segmentFilter: z.record(z.any()).optional(),
  scheduledAt: z.string().datetime().optional(),
  subject: z.string().optional(),
  previewText: z.string().max(150).optional(),
  fromName: z.string().optional(),
  fromEmail: z.string().email().optional(),
  replyTo: z.string().email().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
});

export type EmailCampaignInput = z.infer<typeof campaignSchema>;

// Verstuur een email campagne
export async function createCampaign(
  tenantId: string,
  data: EmailCampaignInput
) {
  const parsed = campaignSchema.parse(data);

  const template = await prisma.emailTemplate.findUnique({
    where: { id: parsed.templateId },
  });

  if (!template || template.tenantId !== tenantId) {
    throw AppError.notFound("Template niet gevonden");
  }

  const campaign = await prisma.emailCampaign.create({
    data: {
      tenantId,
      name: parsed.name,
      templateId: parsed.templateId,
      listId: parsed.listId,
      segmentFilter: parsed.segmentFilter ?? {},
      scheduledAt: parsed.scheduledAt ? new Date(parsed.scheduledAt) : null,
      status: "DRAFT",
    },
  });

  return campaign;
}

// Haal campagnes op voor een tenant
export async function getCampaigns(
  tenantId: string,
  options?: { status?: string; includeMetrics?: boolean }
) {
  const campaigns = await prisma.emailCampaign.findMany({
    where: {
      tenantId,
      ...(options?.status && { status: options.status }),
    },
    include: {
      template: true,
      list: true,
      sends: options?.includeMetrics ? { select: { id: true } } : false,
    },
    orderBy: { createdAt: "desc" },
  });

  return campaigns;
}

// Haal één campagne op met details
export async function getCampaign(tenantId: string, campaignId: string) {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    include: {
      template: true,
      list: { include: { subscribers: { select: { id: true } } } },
      sends: { select: { id: true, status: true } },
    },
  });

  if (!campaign || campaign.tenantId !== tenantId) {
    throw AppError.notFound("Campagne niet gevonden");
  }

  return campaign;
}

// Werk campagne bij
export async function updateCampaign(
  tenantId: string,
  campaignId: string,
  data: Partial<EmailCampaignInput>
) {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign || campaign.tenantId !== tenantId) {
    throw AppError.notFound("Campagne niet gevonden");
  }

  const partial = campaignSchema.partial().parse(data);

  return prisma.emailCampaign.update({
    where: { id: campaignId },
    data: partial,
  });
}

// Wijzig campagnestatus
export async function updateCampaignStatus(
  tenantId: string,
  campaignId: string,
  status: "DRAFT" | "SCHEDULED" | "RUNNING" | "COMPLETED" | "PAUSED" | "FAILED"
) {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign || campaign.tenantId !== tenantId) {
    throw AppError.notFound("Campagne niet gevonden");
  }

  return prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { status },
  });
}

// Plan campagne voor verzending
export async function scheduleCampaign(
  tenantId: string,
  campaignId: string,
  scheduledAt: Date
) {
  const campaign = await getCampaign(tenantId, campaignId);

  if (campaign.status !== "DRAFT") {
    throw AppError.validation("Alleen concept-campagnes kunnen worden ingepland");
  }

  return prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      scheduledAt,
      status: "SCHEDULED",
    },
  });
}

// Hervatten van een gepauzeerde campagne
export async function resumeCampaign(tenantId: string, campaignId: string) {
  const campaign = await getCampaign(tenantId, campaignId);

  if (campaign.status !== "PAUSED") {
    throw AppError.validation("Alleen gepauzeerde campagnes kunnen worden hervat");
  }

  return prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { status: "RUNNING" },
  });
}

// Markeer campagne als verzonden
export async function markCampaignAsSent(tenantId: string, campaignId: string) {
  const campaign = await getCampaign(tenantId, campaignId);
  const sendCount = await prisma.emailSend.count({
    where: { campaignId },
  });

  return prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: "COMPLETED",
      sentAt: new Date(),
      recipientCount: sendCount,
    },
  });
}

// Verwijder campagne
export async function deleteCampaign(tenantId: string, campaignId: string) {
  const campaign = await getCampaign(tenantId, campaignId);

  // Verwijder gerelateerde sends
  await prisma.emailSend.deleteMany({
    where: { campaignId },
  });

  await prisma.emailCampaign.delete({ where: { id: campaignId } });
  return { deleted: true };
}

// Duplicate campagne
export async function duplicateCampaign(
  tenantId: string,
  campaignId: string,
  newName: string
) {
  const campaign = await getCampaign(tenantId, campaignId);

  const duplicate = await prisma.emailCampaign.create({
    data: {
      tenantId,
      name: newName,
      templateId: campaign.templateId,
      listId: campaign.listId,
      segmentFilter: campaign.segmentFilter,
      status: "DRAFT",
    },
  });

  return duplicate;
}

// Verkrijg campagnes met geplande verzending
export async function getScheduledCampaigns(tenantId: string) {
  return prisma.emailCampaign.findMany({
    where: {
      tenantId,
      status: "SCHEDULED",
      scheduledAt: {
        lte: new Date(Date.now() + 24 * 60 * 60 * 1000), // Volgende 24 uur
      },
    },
    include: { template: true, list: true },
    orderBy: { scheduledAt: "asc" },
  });
}

// Batch update van campagne statistieken
export async function updateCampaignStats(
  campaignId: string,
  update: {
    opens?: number;
    clicks?: number;
    bounces?: number;
    conversions?: number;
  }
) {
  return prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      openCount: update.opens ? { increment: update.opens } : undefined,
      clickCount: update.clicks ? { increment: update.clicks } : undefined,
      bounceCount: update.bounces ? { increment: update.bounces } : undefined,
      conversionCount: update.conversions
        ? { increment: update.conversions }
        : undefined,
    },
  });
}
