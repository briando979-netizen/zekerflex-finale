import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const CampaignType = z.enum([
  "PROMOTIONAL",
  "SEASONAL",
  "FEATURED",
  "SUCCESS_STORY",
  "TESTIMONIAL",
  "NEW_FEATURE",
]);

export const CampaignStatus = z.enum(["DRAFT", "ACTIVE", "PAUSED", "ENDED"]);
export const AudienceTarget = z.enum([
  "ALL",
  "FREELANCER",
  "EMPLOYER",
  "ADMIN",
  "NEW_USER",
  "VIP",
]);

export const campaignSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  videoUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  type: CampaignType,
  status: CampaignStatus,
  targetAudience: AudienceTarget,
  startDate: z.date(),
  endDate: z.date().optional(),
});

export type Campaign = z.infer<typeof campaignSchema> & { id: string };

export async function createCampaign(
  data: z.infer<typeof campaignSchema>
) {
  const validated = campaignSchema.parse(data);
  return prisma.marketingCampaign.create({
    data: {
      ...validated,
      startDate: new Date(validated.startDate),
      endDate: validated.endDate ? new Date(validated.endDate) : null,
    },
  });
}

export async function updateCampaign(
  id: string,
  data: Partial<z.infer<typeof campaignSchema>>
) {
  const partial = campaignSchema.partial().parse(data);
  return prisma.marketingCampaign.update({
    where: { id },
    data: partial,
  });
}

export async function getCampaign(id: string) {
  return prisma.marketingCampaign.findUnique({
    where: { id },
    include: {
      deals: { where: { status: "ACTIVE" } },
      analytics: { orderBy: { date: "desc" }, take: 30 },
    },
  });
}

export async function listActiveCampaigns() {
  return prisma.marketingCampaign.findMany({
    where: {
      status: "ACTIVE",
      startDate: { lte: new Date() },
      OR: [
        { endDate: null },
        { endDate: { gte: new Date() } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function trackCampaignView(campaignId: string, userId?: string) {
  const today = new Date().toISOString().split("T")[0];

  await prisma.marketingCampaign.update({
    where: { id: campaignId },
    data: { viewCount: { increment: 1 } },
  });

  return prisma.marketingAnalytics.upsert({
    where: { id: `${campaignId}-${today}` },
    create: {
      id: `${campaignId}-${today}`,
      campaignId,
      date: new Date(today),
      views: 1,
    },
    update: { views: { increment: 1 } },
  });
}

export async function trackCampaignClick(campaignId: string) {
  await prisma.marketingCampaign.update({
    where: { id: campaignId },
    data: { clickCount: { increment: 1 } },
  });
}

export async function trackCampaignConversion(campaignId: string, revenue: number = 0) {
  await prisma.marketingCampaign.update({
    where: { id: campaignId },
    data: { conversionCount: { increment: 1 } },
  });
}

export async function getCampaignAnalytics(campaignId: string) {
  return prisma.marketingAnalytics.findMany({
    where: { campaignId },
    orderBy: { date: "desc" },
  });
}

export async function deleteCampaign(id: string) {
  return prisma.marketingCampaign.delete({
    where: { id },
  });
}
