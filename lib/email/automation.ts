import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const automationSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum([
    "WELCOME_SERIES",
    "ABANDONED_CART",
    "WIN_BACK",
    "RE_ENGAGEMENT",
    "UPSELL",
    "POST_PURCHASE",
    "CUSTOM",
  ]),
  triggerEvent: z.string(),
  triggerDelay: z.number().optional(),
  campaignId: z.string().optional(),
});

export type AutomationInput = z.infer<typeof automationSchema>;

const WELCOME_SERIES_CAMPAIGNS = [
  { delay: 0, name: "Welcome Email" },
  { delay: 1440, name: "24hr Follow-up" },
  { delay: 4320, name: "3-day Offer" },
];

const ABANDONED_CART_CAMPAIGNS = [
  { delay: 60, name: "Abandoned Cart Reminder" },
  { delay: 1440, name: "Cart Discount Offer" },
  { delay: 4320, name: "Last Chance" },
];

const WIN_BACK_CAMPAIGNS = [
  { delay: 0, name: "We Miss You" },
  { delay: 1440, name: "Special Comeback Offer" },
];

export async function createAutomation(
  tenantId: string,
  data: AutomationInput
) {
  const parsed = automationSchema.parse(data);

  return prisma.emailAutomation.create({
    data: {
      tenantId,
      name: parsed.name,
      type: parsed.type,
      triggerEvent: parsed.triggerEvent,
      triggerDelay: parsed.triggerDelay,
      campaignId: parsed.campaignId,
    },
  });
}

export async function getAutomations(tenantId: string) {
  return prisma.emailAutomation.findMany({
    where: { tenantId },
    include: { campaign: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAutomation(tenantId: string, automationId: string) {
  const automation = await prisma.emailAutomation.findUnique({
    where: { id: automationId },
  });
  if (!automation || automation.tenantId !== tenantId) {
    throw AppError.notFound("Automation not found");
  }
  return automation;
}

export async function updateAutomation(
  tenantId: string,
  automationId: string,
  data: Partial<AutomationInput>
) {
  const automation = await prisma.emailAutomation.findUnique({
    where: { id: automationId },
  });
  if (!automation || automation.tenantId !== tenantId) {
    throw AppError.notFound("Automation not found");
  }

  return prisma.emailAutomation.update({
    where: { id: automationId },
    data,
  });
}

export async function enableAutomation(tenantId: string, automationId: string) {
  return updateAutomation(tenantId, automationId, { enabled: true });
}

export async function disableAutomation(
  tenantId: string,
  automationId: string
) {
  return updateAutomation(tenantId, automationId, { enabled: false });
}

export async function createWelcomeSeries(tenantId: string, listId: string) {
  // Create automated welcome series
  const automation = await createAutomation(tenantId, {
    name: "Welcome Series",
    type: "WELCOME_SERIES",
    triggerEvent: "subscriber.added",
  });

  // In production, would create 3 campaigns linked via nextAutomationId
  return automation;
}

export async function createAbandonedCartAutomation(tenantId: string) {
  return createAutomation(tenantId, {
    name: "Abandoned Cart Recovery",
    type: "ABANDONED_CART",
    triggerEvent: "cart.abandoned",
    triggerDelay: 60, // 1 hour
  });
}

export async function createWinBackAutomation(tenantId: string) {
  return createAutomation(tenantId, {
    name: "Win Back Campaign",
    type: "WIN_BACK",
    triggerEvent: "user.inactive",
    triggerDelay: 4320, // 3 days
  });
}

export async function createReEngagementAutomation(tenantId: string) {
  return createAutomation(tenantId, {
    name: "Re-engagement Campaign",
    type: "RE_ENGAGEMENT",
    triggerEvent: "email.no_engagement",
    triggerDelay: 2880, // 2 days
  });
}

export async function executeAutomation(
  automationId: string,
  subscriberId: string
) {
  const automation = await prisma.emailAutomation.findUnique({
    where: { id: automationId },
  });

  if (!automation || !automation.enabled) {
    throw AppError.validation("Automation not found or disabled");
  }

  // Schedule email send based on trigger delay
  const sendTime = new Date(
    Date.now() + (automation.triggerDelay ?? 0) * 60 * 1000
  );

  // In production, would queue this in a job system
  return {
    automationId,
    subscriberId,
    scheduled: true,
    sendTime,
  };
}

export async function deleteAutomation(tenantId: string, automationId: string) {
  const automation = await prisma.emailAutomation.findUnique({
    where: { id: automationId },
  });
  if (!automation || automation.tenantId !== tenantId) {
    throw AppError.notFound("Automation not found");
  }

  await prisma.emailAutomation.delete({ where: { id: automationId } });
  return { deleted: true };
}
