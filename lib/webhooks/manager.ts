import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { z } from "zod";

const createWebhookSchema = z.object({
  url: z.string().url(),
  eventTypes: z.array(z.string()).min(1),
  secret: z.string().optional(),
});

type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export async function createWebhook(
  tenantId: string,
  input: CreateWebhookInput
): Promise<{ id: string; url: string; eventTypes: string[] }> {
  const { url, eventTypes, secret } = createWebhookSchema.parse(input);

  const secretCiphertext = secret ? Buffer.from(secret).toString("base64") : null;

  const webhook = await prisma.webhookSubscription.create({
    data: {
      tenantId,
      url,
      eventTypes,
      secretCiphertext: secretCiphertext || "",
      active: true,
    },
  });

  return { id: webhook.id, url: webhook.url, eventTypes: webhook.eventTypes };
}

export async function updateWebhook(
  tenantId: string,
  webhookId: string,
  input: Partial<CreateWebhookInput>
): Promise<void> {
  const parsed = createWebhookSchema.partial().parse(input);

  const secretCiphertext = parsed.secret ? Buffer.from(parsed.secret).toString("base64") : undefined;

  await prisma.webhookSubscription.update({
    where: { id: webhookId },
    data: {
      ...(parsed.url && { url: parsed.url }),
      ...(parsed.eventTypes && { eventTypes: parsed.eventTypes }),
      ...(secretCiphertext !== undefined && { secretCiphertext }),
    },
  });
}

export async function deleteWebhook(tenantId: string, webhookId: string): Promise<void> {
  await prisma.webhookSubscription.delete({
    where: { id: webhookId },
  });
}

export async function listWebhooks(tenantId: string) {
  const webhooks = await prisma.webhookSubscription.findMany({
    where: { tenantId },
    select: {
      id: true,
      url: true,
      eventTypes: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      deliveries: { take: 1, orderBy: { createdAt: "desc" } },
    },
  });

  return webhooks.map((w) => ({
    ...w,
    lastDelivery: w.deliveries[0] || null,
  }));
}

export async function getWebhookStats(webhookId: string) {
  const [total, successful, failed, pending] = await Promise.all([
    prisma.webhookDelivery.count({ where: { subscriptionId: webhookId } }),
    prisma.webhookDelivery.count({
      where: { subscriptionId: webhookId, deliveredAt: { not: null } },
    }),
    prisma.webhookDelivery.count({
      where: { subscriptionId: webhookId, deliveredAt: null, nextAttemptAt: null },
    }),
    prisma.webhookDelivery.count({
      where: { subscriptionId: webhookId, deliveredAt: null, nextAttemptAt: { not: null } },
    }),
  ]);

  return {
    total,
    successful,
    failed,
    pending,
    successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
  };
}

export async function getDeliveryDetails(deliveryId: string) {
  return prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { subscription: true },
  });
}
