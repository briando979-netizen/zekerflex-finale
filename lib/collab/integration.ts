import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

const integrationSchema = z.object({
  type: z.enum(["calendar", "tasks", "documents", "bot", "webhook", "custom"]),
  config: z.record(z.any()),
  enabled: z.boolean().default(true),
});

export type IntegrationInput = z.infer<typeof integrationSchema>;

export async function setupIntegration(channelId: string, userId: string, data: IntegrationInput) {
  const validated = integrationSchema.parse(data);
  const integration = await prisma.collabIntegration.create({
    data: {
      channelId,
      type: validated.type,
      config: validated.config,
      enabled: validated.enabled,
      setupByUserId: userId,
    },
  });
  return integration;
}

export async function getIntegration(integrationId: string) {
  const integration = await prisma.collabIntegration.findUnique({
    where: { id: integrationId },
  });
  if (!integration) throw AppError.notFound("Integration not found");
  return integration;
}

export async function listChannelIntegrations(channelId: string) {
  return prisma.collabIntegration.findMany({
    where: { channelId },
  });
}

export async function updateIntegration(integrationId: string, config: Record<string, any>) {
  return prisma.collabIntegration.update({
    where: { id: integrationId },
    data: { config },
  });
}

export async function syncCalendar(channelId: string, userId: string, calendarProvider: string) {
  const sync = await prisma.calendarSync.create({
    data: {
      channelId,
      userId,
      provider: calendarProvider,
      syncedAt: new Date(),
    },
  });
  return sync;
}

export async function syncTasks(channelId: string, taskIds: string[]) {
  const syncs = await prisma.taskSync.createMany({
    data: taskIds.map((taskId) => ({
      channelId,
      taskId,
      syncedAt: new Date(),
    })),
  });
  return syncs;
}

export async function linkDocument(channelId: string, documentId: string, title: string) {
  return prisma.documentLink.create({
    data: {
      channelId,
      documentId,
      title,
    },
  });
}

export async function listDocumentLinks(channelId: string) {
  return prisma.documentLink.findMany({
    where: { channelId },
    orderBy: { createdAt: "desc" },
  });
}

export async function setupBot(channelId: string, botConfig: Record<string, any>) {
  return prisma.botIntegration.create({
    data: {
      channelId,
      config: botConfig,
      active: true,
    },
  });
}

export async function setupWebhook(channelId: string, webhookUrl: string, events: string[]) {
  return prisma.collabWebhook.create({
    data: {
      channelId,
      url: webhookUrl,
      events,
      active: true,
    },
  });
}

export async function sendWebhookEvent(webhookId: string, event: string, payload: Record<string, any>) {
  const webhook = await prisma.collabWebhook.findUnique({
    where: { id: webhookId },
  });
  if (!webhook) throw AppError.notFound("Webhook not found");
  if (!webhook.events.includes(event)) return;

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, timestamp: new Date(), payload }),
    });

    if (!response.ok) {
      await prisma.webhookDelivery.create({
        data: {
          webhookId,
          event,
          payload,
          statusCode: response.status,
          success: false,
        },
      });
    } else {
      await prisma.webhookDelivery.create({
        data: {
          webhookId,
          event,
          payload,
          statusCode: 200,
          success: true,
        },
      });
    }
  } catch (error) {
    await prisma.webhookDelivery.create({
      data: {
        webhookId,
        event,
        payload,
        statusCode: 0,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}

export async function disableIntegration(integrationId: string) {
  return prisma.collabIntegration.update({
    where: { id: integrationId },
    data: { enabled: false },
  });
}
