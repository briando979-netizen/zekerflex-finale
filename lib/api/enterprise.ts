import crypto from "crypto";
import { z } from "zod";

export const apiKeySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  createdAt: z.date(),
  lastUsedAt: z.date().nullable(),
  revokedAt: z.date().nullable(),
});

export type ApiKey = z.infer<typeof apiKeySchema>;

export function generateApiKey(): string {
  return `zf_${crypto.randomBytes(32).toString("hex")}`;
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export const webhookSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  url: z.string().url(),
  events: z.array(z.string()),
  active: z.boolean(),
  createdAt: z.date(),
  lastTriggeredAt: z.date().nullable(),
  secret: z.string(),
});

export type Webhook = z.infer<typeof webhookSchema>;

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function signWebhookPayload(payload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
}

export const rateLimitSchema = z.object({
  requestsPerMinute: z.number().min(1),
  requestsPerHour: z.number().min(1),
  requestsPerDay: z.number().min(1),
});

export type RateLimit = z.infer<typeof rateLimitSchema>;

export const rateLimits: Record<string, RateLimit> = {
  free: {
    requestsPerMinute: 10,
    requestsPerHour: 300,
    requestsPerDay: 1000,
  },
  pro: {
    requestsPerMinute: 100,
    requestsPerHour: 5000,
    requestsPerDay: 100000,
  },
  business: {
    requestsPerMinute: 1000,
    requestsPerHour: 50000,
    requestsPerDay: 1000000,
  },
  enterprise: {
    requestsPerMinute: 10000,
    requestsPerHour: 500000,
    requestsPerDay: 10000000,
  },
};

export async function verifyApiKey(key: string): Promise<ApiKey | null> {
  // In production, query database for key hash
  // For now, return null (implement with prisma query)
  return null;
}

export async function triggerWebhook(webhook: Webhook, eventType: string, payload: unknown) {
  const body = JSON.stringify({
    id: crypto.randomUUID(),
    event: eventType,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const signature = signWebhookPayload(body, webhook.secret);

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ZF-Signature": signature,
        "X-ZF-Event": eventType,
        "X-ZF-Timestamp": new Date().toISOString(),
      },
      body,
    });

    return response.ok;
  } catch {
    return false;
  }
}
