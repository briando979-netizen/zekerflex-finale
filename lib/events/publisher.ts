import { prisma } from "@/lib/prisma";
import { z } from "zod";

export type EventType =
  | "user.created"
  | "user.updated"
  | "invoice.created"
  | "invoice.paid"
  | "shift.created"
  | "shift.accepted"
  | "shift.cancelled"
  | "payment.completed"
  | "contract.signed"
  | "app.installed"
  | "app.uninstalled";

const eventPayloadSchema = z.record(z.any());

interface PublishEventInput {
  tenantId: string;
  eventType: EventType;
  payload: unknown;
  version?: number;
}

const EVENT_VERSIONS: Record<EventType, number> = {
  "user.created": 1,
  "user.updated": 1,
  "invoice.created": 1,
  "invoice.paid": 1,
  "shift.created": 1,
  "shift.accepted": 1,
  "shift.cancelled": 1,
  "payment.completed": 1,
  "contract.signed": 1,
  "app.installed": 1,
  "app.uninstalled": 1,
};

export async function publishEvent(input: PublishEventInput): Promise<void> {
  const { tenantId, eventType, payload, version } = input;

  // Validate payload
  const validPayload = eventPayloadSchema.parse(payload);

  // Get webhook subscriptions for this tenant + event type
  const subscriptions = await prisma.webhookSubscription.findMany({
    where: {
      tenantId,
      active: true,
      eventTypes: { has: eventType },
    },
  });

  if (subscriptions.length === 0) return;

  // Create deliveries for each subscription
  const now = new Date();
  const deliveries = subscriptions.map((sub) => ({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    subscriptionId: sub.id,
    eventType,
    payload: {
      id: `evt_${Date.now()}`,
      type: eventType,
      version: version || EVENT_VERSIONS[eventType] || 1,
      createdAt: now.toISOString(),
      tenantId,
      data: validPayload,
    },
    statusCode: null,
    attempts: 0,
    deliveredAt: null,
    nextAttemptAt: now,
    lastError: null,
    createdAt: now,
    subscriptionId: sub.id,
  }));

  await prisma.webhookDelivery.createMany({ data: deliveries });
}

export const RETRY_SCHEDULE = [1, 5, 30, 300, 3600]; // seconds: 1s, 5s, 30s, 5m, 1h

export async function getEventCatalog() {
  return Object.entries(EVENT_VERSIONS).map(([type, version]) => ({
    type,
    version,
    description: `${type} event (v${version})`,
  }));
}
