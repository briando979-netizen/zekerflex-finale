// Outbound webhooks for shop events

export interface WebhookSubscription {
  id: string;
  url: string;
  events: WebhookEventType[];
  active: boolean;
  secret?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  lastTriggered?: Date;
}

export type WebhookEventType =
  | "order.created"
  | "order.paid"
  | "subscription.created"
  | "subscription.renewed"
  | "subscription.cancelled"
  | "customer.created"
  | "payment.failed"
  | "refund.issued";

export interface WebhookPayload {
  id: string;
  event: WebhookEventType;
  timestamp: Date;
  data: Record<string, any>;
}

export async function registerWebhook(
  url: string,
  events: WebhookEventType[],
  secret?: string
): Promise<WebhookSubscription> {
  // TODO: Store in database
  return {
    id: `hook_${Date.now()}`,
    url,
    events,
    active: true,
    secret,
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date(),
  };
}

export async function triggerWebhook(
  event: WebhookEventType,
  data: Record<string, any>
): Promise<void> {
  // TODO: Find all subscriptions for this event
  // For each subscription, POST the webhook payload
  const payload: WebhookPayload = {
    id: `evt_${Date.now()}`,
    event,
    timestamp: new Date(),
    data,
  };

  console.log(`[Webhook] Triggered ${event}:`, payload);

  // In production:
  // 1. Query all active webhooks for this event type
  // 2. For each: POST to the URL with signed headers
  // 3. Retry on failure with exponential backoff
  // 4. Log all attempts
}

export async function getWebhookSubscriptions(): Promise<WebhookSubscription[]> {
  // TODO: Fetch from database
  return [];
}

export async function deleteWebhook(id: string): Promise<void> {
  // TODO: Delete from database
}

export function signWebhookPayload(payload: WebhookPayload, secret: string): string {
  // Simple HMAC-SHA256 signature
  const crypto = require("crypto");
  const message = JSON.stringify(payload);
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}
