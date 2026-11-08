import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const campaignSchema = z.object({
  name: z.string().min(1).max(255),
  templateId: z.string(),
  listId: z.string().optional(),
  segmentFilter: z.record(z.any()).optional(),
  scheduledAt: z.string().datetime().optional(),
});

export type CampaignInput = z.infer<typeof campaignSchema>;

export async function createCampaign(tenantId: string, data: CampaignInput) {
  const parsed = campaignSchema.parse(data);
  const template = await prisma.emailTemplate.findUnique({
    where: { id: parsed.templateId },
  });
  if (!template || template.tenantId !== tenantId) {
    throw AppError.notFound("Template not found");
  }

  return prisma.emailCampaign.create({
    data: {
      tenantId,
      name: parsed.name,
      templateId: parsed.templateId,
      listId: parsed.listId,
      segmentFilter: parsed.segmentFilter ?? {},
      scheduledAt: parsed.scheduledAt ? new Date(parsed.scheduledAt) : null,
    },
  });
}

export async function getCampaigns(tenantId: string, status?: string) {
  return prisma.emailCampaign.findMany({
    where: {
      tenantId,
      ...(status && { status }),
    },
    include: { template: true, list: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCampaign(tenantId: string, campaignId: string) {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    include: { template: true, list: true, sends: true },
  });
  if (!campaign || campaign.tenantId !== tenantId) {
    throw AppError.notFound("Campaign not found");
  }
  return campaign;
}

export async function updateCampaignStatus(
  tenantId: string,
  campaignId: string,
  status: string
) {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
  });
  if (!campaign || campaign.tenantId !== tenantId) {
    throw AppError.notFound("Campaign not found");
  }

  return prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { status },
  });
}

export async function getCampaignAnalytics(
  tenantId: string,
  campaignId: string
) {
  const campaign = await getCampaign(tenantId, campaignId);

  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    recipientCount: campaign.recipientCount,
    openCount: campaign.openCount,
    clickCount: campaign.clickCount,
    bounceCount: campaign.bounceCount,
    conversionCount: campaign.conversionCount,
    openRate: campaign.recipientCount
      ? ((campaign.openCount / campaign.recipientCount) * 100).toFixed(2)
      : "0",
    clickRate: campaign.recipientCount
      ? ((campaign.clickCount / campaign.recipientCount) * 100).toFixed(2)
      : "0",
    bounceRate: campaign.recipientCount
      ? ((campaign.bounceCount / campaign.recipientCount) * 100).toFixed(2)
      : "0",
  };
}

export async function deleteCampaign(tenantId: string, campaignId: string) {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
  });
  if (!campaign || campaign.tenantId !== tenantId) {
    throw AppError.notFound("Campaign not found");
  }

  await prisma.emailCampaign.delete({ where: { id: campaignId } });
  return { deleted: true };
}
