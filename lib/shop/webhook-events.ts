// Stripe webhook event handling

export interface WebhookEvent {
  id: string;
  type: string;
  timestamp: Date;
  data: any;
  status: "processed" | "failed" | "pending";
  error?: string;
}

export const WEBHOOK_EVENT_TYPES = {
  // Payments
  "payment_intent.succeeded": "Betaling geslaagd",
  "payment_intent.payment_failed": "Betaling mislukt",
  "charge.refunded": "Terugbetaling verwerkt",

  // Subscriptions
  "customer.subscription.created": "Abonnement gestart",
  "customer.subscription.updated": "Abonnement gewijzigd",
  "customer.subscription.deleted": "Abonnement geannuleerd",
  "invoice.payment_action_required": "Betaling vereist",
  "invoice.payment_succeeded": "Abonnement betaald",

  // Disputes
  "charge.dispute.created": "Geschil ingediend",
  "charge.dispute.closed": "Geschil opgelost",
};

export function parseWebhookEvent(rawEvent: any): WebhookEvent {
  return {
    id: rawEvent.id || `evt_${Date.now()}`,
    type: rawEvent.type || "unknown",
    timestamp: new Date(rawEvent.created * 1000),
    data: rawEvent.data,
    status: "pending",
  };
}

export function getEventDescription(eventType: string): string {
  return (
    WEBHOOK_EVENT_TYPES[eventType as keyof typeof WEBHOOK_EVENT_TYPES] ||
    `Event: ${eventType}`
  );
}

export async function logWebhookEvent(event: WebhookEvent): Promise<void> {
  // TODO: Store in database/KV
  console.log(`[Webhook] ${event.type} at ${event.timestamp.toISOString()}`);
}

export async function getRecentWebhookEvents(limit: number = 50): Promise<WebhookEvent[]> {
  // TODO: Fetch from database/KV
  return [];
}
