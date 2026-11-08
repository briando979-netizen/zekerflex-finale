import { prisma } from "@/lib/prisma";
import { z } from "zod";
import crypto from "crypto";

const webhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()),
  active: z.boolean().default(true),
  retryAttempts: z.number().int().min(0).max(10).default(3),
});

export type WebhookConfig = z.infer<typeof webhookSchema>;

export async function registerWebhook(integrationId: string, config: WebhookConfig) {
  const secret = crypto.randomBytes(32).toString("hex");
  return prisma.webhook.create({
    data: {
      integrationId,
      url: config.url,
      events: config.events,
      secret,
      retryAttempts: config.retryAttempts,
      active: config.active,
    },
  });
}

export async function deliverWebhook(
  webhookId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook || !webhook.active) return false;

  const timestamp = Math.floor(Date.now() / 1000);
  const message = `${timestamp}.${JSON.stringify(payload)}`;
  const signature = crypto.createHmac("sha256", webhook.secret).update(message).digest("hex");

  let attempt = 0;
  while (attempt < webhook.retryAttempts) {
    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Event": event,
          "X-Webhook-Signature": signature,
          "X-Webhook-Timestamp": timestamp.toString(),
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await prisma.webhookLog.create({
          data: {
            webhookId,
            event,
            status: "SUCCESS",
            statusCode: response.status,
            payload,
          },
        });
        return true;
      }

      attempt++;
      if (attempt < webhook.retryAttempts) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    } catch (error) {
      attempt++;
    }
  }

  await prisma.webhookLog.create({
    data: {
      webhookId,
      event,
      status: "FAILED",
      statusCode: 0,
      payload,
    },
  });

  return false;
}

export async function getWebhookLogs(webhookId: string, limit = 100) {
  return prisma.webhookLog.findMany({
    where: { webhookId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function testWebhook(webhookId: string) {
  return deliverWebhook(webhookId, "test", { message: "Webhook test" });
}
