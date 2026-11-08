import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const listSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["SUBSCRIBERS", "CUSTOMERS", "PROSPECTS", "CUSTOM"]),
  description: z.string().optional(),
});

const subscriberSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  consentGiven: z.boolean().default(true),
});

export type ListInput = z.infer<typeof listSchema>;
export type SubscriberInput = z.infer<typeof subscriberSchema>;

export async function createList(tenantId: string, data: ListInput) {
  const parsed = listSchema.parse(data);
  return prisma.emailList.create({
    data: {
      tenantId,
      ...parsed,
    },
  });
}

export async function getLists(tenantId: string) {
  return prisma.emailList.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getList(tenantId: string, listId: string) {
  const list = await prisma.emailList.findUnique({
    where: { id: listId },
    include: { subscribers: true },
  });
  if (!list || list.tenantId !== tenantId) {
    throw AppError.notFound("List not found");
  }
  return list;
}

export async function updateList(
  tenantId: string,
  listId: string,
  data: Partial<ListInput>
) {
  const list = await prisma.emailList.findUnique({ where: { id: listId } });
  if (!list || list.tenantId !== tenantId) {
    throw AppError.notFound("List not found");
  }

  return prisma.emailList.update({
    where: { id: listId },
    data,
  });
}

export async function addSubscriber(
  tenantId: string,
  listId: string,
  data: SubscriberInput
) {
  const list = await prisma.emailList.findUnique({ where: { id: listId } });
  if (!list || list.tenantId !== tenantId) {
    throw AppError.notFound("List not found");
  }

  const parsed = subscriberSchema.parse(data);
  return prisma.emailSubscriber.upsert({
    where: { listId_email: { listId, email: parsed.email } },
    update: {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      metadata: parsed.metadata ?? {},
    },
    create: {
      tenantId,
      listId,
      email: parsed.email,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      metadata: parsed.metadata ?? {},
      consentGiven: parsed.consentGiven,
      consentDate: parsed.consentGiven ? new Date() : null,
    },
  });
}

export async function removeSubscriber(
  tenantId: string,
  listId: string,
  email: string
) {
  const subscriber = await prisma.emailSubscriber.findUnique({
    where: { listId_email: { listId, email } },
  });
  if (!subscriber || subscriber.tenantId !== tenantId) {
    throw AppError.notFound("Subscriber not found");
  }

  await prisma.emailSubscriber.delete({
    where: { listId_email: { listId, email } },
  });
  return { deleted: true };
}

export async function getSubscribers(tenantId: string, listId: string) {
  const list = await prisma.emailList.findUnique({ where: { id: listId } });
  if (!list || list.tenantId !== tenantId) {
    throw AppError.notFound("List not found");
  }

  return prisma.emailSubscriber.findMany({
    where: { listId, tenantId },
    orderBy: { createdAt: "desc" },
  });
}

export async function cleanupInactiveSubscribers(
  tenantId: string,
  listId: string,
  inactiveDays: number = 90
) {
  const list = await prisma.emailList.findUnique({ where: { id: listId } });
  if (!list || list.tenantId !== tenantId) {
    throw AppError.notFound("List not found");
  }

  const cutoffDate = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);

  const result = await prisma.emailSubscriber.updateMany({
    where: {
      listId,
      tenantId,
      lastEngagementAt: { lt: cutoffDate },
    },
    data: {
      status: "INACTIVE",
    },
  });

  return { cleaned: result.count };
}

export async function validateSubscriberEmail(
  tenantId: string,
  listId: string,
  email: string
): Promise<boolean> {
  // Basic email validation + domain check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
