import { prisma } from "@/lib/prisma";
import { EmailIntegration, SlackIntegration, WebhookIntegration } from "@prisma/client";
import crypto from "crypto";

// Email Integration
export async function setupEmailIntegration(
  tenantId: string,
  data: {
    supportEmail: string;
    imapServer?: string;
    imapPort?: number;
    password?: string;
  }
): Promise<EmailIntegration> {
  const existingIntegration = await prisma.emailIntegration.findUnique({
    where: { tenantId },
  });

  if (existingIntegration) {
    throw new Error("Email integration already exists for this tenant");
  }

  return prisma.emailIntegration.create({
    data: {
      tenantId,
      supportEmail: data.supportEmail,
      imapServer: data.imapServer,
      imapPort: data.imapPort || 993,
      encryptedPassword: data.password ? encryptPassword(data.password) : undefined,
    },
  });
}

// Update Email Integration
export async function updateEmailIntegration(
  tenantId: string,
  data: Partial<{
    supportEmail: string;
    imapServer: string;
    imapPort: number;
    password: string;
    enabled: boolean;
  }>
): Promise<EmailIntegration> {
  const integration = await prisma.emailIntegration.findUnique({
    where: { tenantId },
  });

  if (!integration) {
    throw new Error("Email integration not found");
  }

  return prisma.emailIntegration.update({
    where: { tenantId },
    data: {
      supportEmail: data.supportEmail,
      imapServer: data.imapServer,
      imapPort: data.imapPort,
      encryptedPassword: data.password ? encryptPassword(data.password) : undefined,
      enabled: data.enabled,
    },
  });
}

// Slack Integration
export async function setupSlackIntegration(
  tenantId: string,
  data: {
    botToken: string;
    userToken?: string;
    alertChannelId?: string;
    ticketChannelId?: string;
  }
): Promise<SlackIntegration> {
  const existingIntegration = await prisma.slackIntegration.findUnique({
    where: { tenantId },
  });

  if (existingIntegration) {
    throw new Error("Slack integration already exists for this tenant");
  }

  return prisma.slackIntegration.create({
    data: {
      tenantId,
      encryptedBotToken: encryptPassword(data.botToken),
      encryptedUserToken: data.userToken
        ? encryptPassword(data.userToken)
        : undefined,
      alertChannelId: data.alertChannelId,
      ticketChannelId: data.ticketChannelId,
    },
  });
}

// Update Slack Integration
export async function updateSlackIntegration(
  tenantId: string,
  data: Partial<{
    alertChannelId: string;
    ticketChannelId: string;
    canPostMessages: boolean;
    canReadMessages: boolean;
    enabled: boolean;
  }>
): Promise<SlackIntegration> {
  const integration = await prisma.slackIntegration.findUnique({
    where: { tenantId },
  });

  if (!integration) {
    throw new Error("Slack integration not found");
  }

  return prisma.slackIntegration.update({
    where: { tenantId },
    data,
  });
}

// Webhook Integration
export async function setupWebhookIntegration(
  tenantId: string,
  data: {
    url: string;
    events?: string[];
    secret?: string;
  }
): Promise<WebhookIntegration> {
  const secret = data.secret || generateSecret();

  return prisma.webhookIntegration.create({
    data: {
      tenantId,
      url: data.url,
      secret,
      events: data.events || [],
    },
  });
}

// Update Webhook Integration
export async function updateWebhookIntegration(
  id: string,
  tenantId: string,
  data: Partial<{
    url: string;
    events: string[];
    enabled: boolean;
    maxRetries: number;
    retryDelaySeconds: number;
  }>
): Promise<WebhookIntegration> {
  const integration = await prisma.webhookIntegration.findUnique({
    where: { id },
  });

  if (!integration || integration.tenantId !== tenantId) {
    throw new Error("Webhook integration not found");
  }

  return prisma.webhookIntegration.update({
    where: { id },
    data,
  });
}

// List webhook integrations
export async function listWebhookIntegrations(
  tenantId: string,
  enabled?: boolean
) {
  const where: any = { tenantId };
  if (enabled !== undefined) where.enabled = enabled;

  return prisma.webhookIntegration.findMany({
    where,
  });
}

// Delete webhook integration
export async function deleteWebhookIntegration(
  id: string,
  tenantId: string
): Promise<void> {
  const integration = await prisma.webhookIntegration.findUnique({
    where: { id },
  });

  if (!integration || integration.tenantId !== tenantId) {
    throw new Error("Webhook integration not found");
  }

  await prisma.webhookIntegration.delete({
    where: { id },
  });
}

// Trigger webhook
export async function triggerWebhook(
  tenantId: string,
  eventType: string,
  payload: any
): Promise<void> {
  const webhooks = await listWebhookIntegrations(tenantId, true);

  for (const webhook of webhooks) {
    if (!webhook.events.includes(eventType)) {
      continue;
    }

    // Create delivery log entry
    const signature = generateSignature(payload, webhook.secret);

    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Event-Type": eventType,
        },
        body: JSON.stringify(payload),
      });

      await prisma.webhookDeliveryLog.create({
        data: {
          webhookId: webhook.id,
          eventType,
          payload,
          statusCode: response.status,
          responseBody: await response.text(),
          success: response.ok,
        },
      });

      if (!response.ok && webhook.maxRetries > 0) {
        // Schedule retry
        scheduleWebhookRetry(webhook.id, eventType, payload);
      }
    } catch (error) {
      await prisma.webhookDeliveryLog.create({
        data: {
          webhookId: webhook.id,
          eventType,
          payload,
          success: false,
        },
      });
    }
  }
}

// Schedule webhook retry
async function scheduleWebhookRetry(
  webhookId: string,
  eventType: string,
  payload: any
): Promise<void> {
  const webhook = await prisma.webhookIntegration.findUnique({
    where: { id: webhookId },
  });

  if (!webhook) return;

  // In a production system, this would queue a retry job
  // For now, we just log it
  console.log(`Webhook retry scheduled for ${webhookId}`);
}

// Encryption helpers
function encryptPassword(password: string): string {
  // In production, use a proper encryption library and secure key management
  const cipher = crypto.createCipher("aes-256-cbc", process.env.ENCRYPTION_KEY || "default");
  let encrypted = cipher.update(password, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

function decryptPassword(encrypted: string): string {
  // In production, use a proper encryption library and secure key management
  const decipher = crypto.createDecipher("aes-256-cbc", process.env.ENCRYPTION_KEY || "default");
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function generateSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

function generateSignature(payload: any, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest("hex");
}

// Get integration status
export async function getIntegrationStatus(tenantId: string) {
  const [emailIntegration, slackIntegration, webhooks] = await Promise.all([
    prisma.emailIntegration.findUnique({ where: { tenantId } }),
    prisma.slackIntegration.findUnique({ where: { tenantId } }),
    listWebhookIntegrations(tenantId),
  ]);

  return {
    email: emailIntegration ? { enabled: emailIntegration.enabled } : null,
    slack: slackIntegration ? { enabled: slackIntegration.enabled } : null,
    webhooks: webhooks.map((w) => ({
      id: w.id,
      enabled: w.enabled,
      lastTriggeredAt: w.lastTriggeredAt,
    })),
  };
}
