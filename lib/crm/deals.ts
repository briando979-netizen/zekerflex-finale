import { prisma } from "@/lib/prisma";
import { DealStage } from "@prisma/client";
import { z } from "zod";

export const crmDealSchema = z.object({
  contactId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  valueCents: z.number().int().positive(),
  stage: z.nativeEnum(DealStage).default("PROSPECT"),
  probability: z.number().int().min(0).max(100).default(50),
});

export type CrmDealInput = z.infer<typeof crmDealSchema>;

export async function createDeal(
  tenantId: string,
  createdBy: string,
  data: CrmDealInput
) {
  return prisma.crmDeal.create({
    data: {
      tenantId,
      createdBy,
      ...crmDealSchema.parse(data),
    },
    include: { contact: true },
  });
}

export async function getDeal(id: string, tenantId: string) {
  return prisma.crmDeal.findFirst({
    where: { id, tenantId },
    include: { contact: true, activities: true },
  });
}

export async function listDeals(tenantId: string, stage?: DealStage) {
  return prisma.crmDeal.findMany({
    where: { tenantId, ...(stage && { stage }) },
    include: { contact: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function updateDeal(
  id: string,
  tenantId: string,
  data: Partial<CrmDealInput> & {
    wonAt?: Date | null;
    lostAt?: Date | null;
    lostReason?: string;
  }
) {
  return prisma.crmDeal.update({
    where: { id_tenantId: { id, tenantId } },
    data,
  });
}

export async function winDeal(id: string, tenantId: string) {
  return prisma.crmDeal.update({
    where: { id_tenantId: { id, tenantId } },
    data: {
      stage: "WON",
      wonAt: new Date(),
      probability: 100,
    },
  });
}

export async function loseDeal(id: string, tenantId: string, reason: string) {
  return prisma.crmDeal.update({
    where: { id_tenantId: { id, tenantId } },
    data: {
      stage: "LOST",
      lostAt: new Date(),
      lostReason: reason,
      probability: 0,
    },
  });
}

export async function getPipeline(tenantId: string) {
  const deals = await prisma.crmDeal.findMany({
    where: { tenantId },
  });

  const pipeline = {
    PROSPECT: deals.filter((d) => d.stage === "PROSPECT"),
    QUALIFIED: deals.filter((d) => d.stage === "QUALIFIED"),
    PROPOSAL: deals.filter((d) => d.stage === "PROPOSAL"),
    NEGOTIATION: deals.filter((d) => d.stage === "NEGOTIATION"),
    WON: deals.filter((d) => d.stage === "WON"),
    LOST: deals.filter((d) => d.stage === "LOST"),
  };

  return {
    pipeline,
    totalValue: deals.reduce((sum, d) => sum + d.valueCents, 0),
    winCount: pipeline.WON.length,
    lostCount: pipeline.LOST.length,
  };
}
