import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const DiscountType = z.enum(["PERCENTAGE", "FIXED", "BOGO"]);

export const dealSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  discountType: DiscountType,
  discountValue: z.number().positive(),
  code: z.string().optional(),
  maxUses: z.number().positive().optional(),
  videoUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  targetAudience: z.enum([
    "ALL",
    "FREELANCER",
    "EMPLOYER",
    "NEW_USER",
    "VIP",
  ]),
  startDate: z.date(),
  endDate: z.date().optional(),
  campaignId: z.string().optional(),
});

export type Deal = z.infer<typeof dealSchema> & { id: string };

export async function createDeal(data: z.infer<typeof dealSchema>) {
  const validated = dealSchema.parse(data);

  let code = validated.code;
  if (!code) {
    code = `DEAL-${Date.now().toString(36).toUpperCase()}`;
  }

  return prisma.marketingDeal.create({
    data: {
      ...validated,
      code,
      startDate: new Date(validated.startDate),
      endDate: validated.endDate ? new Date(validated.endDate) : null,
    },
  });
}

export async function updateDeal(
  id: string,
  data: Partial<z.infer<typeof dealSchema>>
) {
  const partial = dealSchema.partial().parse(data);
  return prisma.marketingDeal.update({
    where: { id },
    data: partial,
  });
}

export async function getDeal(id: string) {
  return prisma.marketingDeal.findUnique({
    where: { id },
    include: { campaign: true },
  });
}

export async function getDealByCode(code: string) {
  return prisma.marketingDeal.findUnique({
    where: { code },
    include: { campaign: true },
  });
}

export async function listActiveDeals() {
  return prisma.marketingDeal.findMany({
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

export async function listDealsByCampaign(campaignId: string) {
  return prisma.marketingDeal.findMany({
    where: { campaignId },
    orderBy: { createdAt: "desc" },
  });
}

export async function validateDealCode(code: string): Promise<Deal | null> {
  const deal = await getDealByCode(code);

  if (!deal) return null;
  if (deal.status !== "ACTIVE") return null;
  if (deal.maxUses && deal.usedCount >= deal.maxUses) return null;

  const now = new Date();
  if (deal.startDate > now) return null;
  if (deal.endDate && deal.endDate < now) return null;

  return deal;
}

export async function useDealCode(code: string) {
  const deal = await validateDealCode(code);
  if (!deal) throw new Error("Invalid deal code");

  await prisma.marketingDeal.update({
    where: { code },
    data: { usedCount: { increment: 1 } },
  });

  return deal;
}

export async function trackDealView(dealId: string) {
  const today = new Date().toISOString().split("T")[0];

  await prisma.marketingDeal.update({
    where: { id: dealId },
    data: { viewCount: { increment: 1 } },
  });

  return prisma.marketingAnalytics.upsert({
    where: { id: `deal-${dealId}-${today}` },
    create: {
      id: `deal-${dealId}-${today}`,
      dealId,
      date: new Date(today),
      views: 1,
    },
    update: { views: { increment: 1 } },
  });
}

export async function trackDealClick(dealId: string) {
  await prisma.marketingDeal.update({
    where: { id: dealId },
    data: { clickCount: { increment: 1 } },
  });
}

export async function trackDealConversion(dealId: string) {
  await prisma.marketingDeal.update({
    where: { id: dealId },
    data: { conversionCount: { increment: 1 } },
  });
}

export async function getDealAnalytics(dealId: string) {
  return prisma.marketingAnalytics.findMany({
    where: { dealId },
    orderBy: { date: "desc" },
  });
}

export async function deleteDeal(id: string) {
  return prisma.marketingDeal.delete({
    where: { id },
  });
}
