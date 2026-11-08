export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  secret?: string;
  headers?: Record<string, string>;
  createdAt: Date;
  lastTriggered?: Date;
  failureCount: number;
}

export type WebhookEvent =
  | "deployment.started"
  | "deployment.completed"
  | "deployment.failed"
  | "build.started"
  | "build.completed"
  | "test.completed"
  | "alert.created"
  | "alert.resolved";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: Date;
  data: Record<string, any>;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: WebhookPayload;
  status: number;
  timestamp: Date;
  retries: number;
}

const webhooks: Map<string, Webhook> = new Map();
const deliveries: WebhookDelivery[] = [];
let webhookIdCounter = 1;
let deliveryIdCounter = 1;

export function registerWebhook(
  url: string,
  events: WebhookEvent[],
  secret?: string,
  headers?: Record<string, string>
): Webhook {
  const id = `webhook-${webhookIdCounter++}`;

  const webhook: Webhook = {
    id,
    url,
    events,
    active: true,
    secret,
    headers,
    createdAt: new Date(),
    failureCount: 0,
  };

  webhooks.set(id, webhook);
  return webhook;
}

export function getWebhook(id: string): Webhook | null {
  return webhooks.get(id) || null;
}

export function listWebhooks(): Webhook[] {
  return Array.from(webhooks.values());
}

export function updateWebhook(
  id: string,
  updates: Partial<Webhook>
): Webhook | null {
  const webhook = webhooks.get(id);
  if (!webhook) return null;

  Object.assign(webhook, updates);
  return webhook;
}

export function deleteWebhook(id: string): boolean {
  return webhooks.delete(id);
}

export function toggleWebhook(id: string): Webhook | null {
  const webhook = webhooks.get(id);
  if (!webhook) return null;

  webhook.active = !webhook.active;
  return webhook;
}

export async function triggerWebhook(
  event: WebhookEvent,
  data: Record<string, any>
): Promise<WebhookDelivery[]> {
  const payload: WebhookPayload = {
    event,
    timestamp: new Date(),
    data,
  };

  const deliveries: WebhookDelivery[] = [];

  for (const webhook of webhooks.values()) {
    if (!webhook.active || !webhook.events.includes(event)) continue;

    const delivery: WebhookDelivery = {
      id: `delivery-${deliveryIdCounter++}`,
      webhookId: webhook.id,
      event,
      payload,
      status: 200,
      timestamp: new Date(),
      retries: 0,
    };

    deliveries.push(delivery);

    if (deliveries.length > 10000) {
      deliveries.shift();
    }

    try {
      webhook.lastTriggered = new Date();
    } catch {
      webhook.failureCount++;
    }
  }

  return deliveries;
}

export function getWebhookDeliveries(webhookId: string, limit: number = 100): WebhookDelivery[] {
  return deliveries
    .filter(d => d.webhookId === webhookId)
    .slice(-limit);
}

export function getDeliveryStats() {
  const successful = deliveries.filter(d => d.status >= 200 && d.status < 300).length;
  const failed = deliveries.filter(d => d.status >= 400).length;
  const total = deliveries.length;

  return {
    total,
    successful,
    failed,
    successRate: total > 0 ? (successful / total) * 100 : 0,
    failedWebhooks: Array.from(webhooks.values()).filter(w => w.failureCount > 0),
  };
}

export function resetWebhookFailures(id: string): Webhook | null {
  const webhook = webhooks.get(id);
  if (!webhook) return null;

  webhook.failureCount = 0;
  return webhook;
}

export function getWebhookStats() {
  return {
    totalWebhooks: webhooks.size,
    activeWebhooks: Array.from(webhooks.values()).filter(w => w.active).length,
    totalDeliveries: deliveries.length,
    deliveryStats: getDeliveryStats(),
  };
}
