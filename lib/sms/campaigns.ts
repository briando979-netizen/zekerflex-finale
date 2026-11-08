import { prisma } from "@/lib/prisma";
import { z } from "zod";

const smsCampaignSchema = z.object({
  name: z.string().min(1),
  message: z.string().min(1).max(160),
  segments: z.string().array(),
  scheduledFor: z.date(),
  shortcode: z.string().optional(),
  longcode: z.string().optional(),
  abTest: z.boolean().optional(),
  variantB: z.string().optional(),
  complianceOpted: z.boolean(),
});

export type SMSCampaign = z.infer<typeof smsCampaignSchema>;

export async function createCampaign(data: SMSCampaign, tenantId: string) {
  const validated = smsCampaignSchema.parse(data);
  return prisma.smsCampaign.create({
    data: {
      ...validated,
      tenantId,
      status: "DRAFT",
      messageLength: validated.message.length,
      segmentCount: validated.segments.length,
    },
  });
}

export async function getCampaign(id: string, tenantId: string) {
  return prisma.smsCampaign.findUnique({
    where: { id, tenantId },
    include: { metrics: true },
  });
}

export async function listCampaigns(tenantId: string, limit = 50) {
  return prisma.smsCampaign.findMany({
    where: { tenantId },
    include: { metrics: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function updateCampaign(id: string, tenantId: string, data: Partial<SMSCampaign>) {
  return prisma.smsCampaign.update({
    where: { id, tenantId },
    data: { ...data, updatedAt: new Date() },
  });
}

export async function publishCampaign(id: string, tenantId: string) {
  const campaign = await prisma.smsCampaign.findUnique({ where: { id, tenantId } });
  if (!campaign) throw new Error("Campaign not found");

  return prisma.smsCampaign.update({
    where: { id, tenantId },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
}

export async function getMetrics(campaignId: string, tenantId: string) {
  return prisma.smsCampaignMetrics.findUnique({
    where: { campaignId },
  });
}

export async function updateMetrics(campaignId: string, delta: Record<string, number>) {
  return prisma.smsCampaignMetrics.update({
    where: { campaignId },
    data: {
      delivered: { increment: delta.delivered ?? 0 },
      failed: { increment: delta.failed ?? 0 },
      opened: { increment: delta.opened ?? 0 },
      clicked: { increment: delta.clicked ?? 0 },
      converted: { increment: delta.converted ?? 0 },
    },
  });
}
