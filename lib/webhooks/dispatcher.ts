import { createHmac, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptWebhookSecret } from "@/lib/webhooks/crypto";

export type WebhookEventType = "shift.matched" | "freelancer.checked_in" | "timesheet.approved" | "dispute.opened";

function signature(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export async function dispatchWebhook(eventType: WebhookEventType, tenantId: string, payload: Record<string, unknown>): Promise<void> {
  const subscriptions = await prisma.webhookSubscription.findMany({ where: { tenantId, active: true } });
  for (const subscription of subscriptions) {
    const body = JSON.stringify({ id: randomBytes(12).toString("hex"), type: eventType, createdAt: new Date().toISOString(), data: payload });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const delivery = await prisma.webhookDelivery.create({ data: { subscriptionId: subscription.id, eventType, payload: JSON.parse(body) } });
    let lastError = "";
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        const response = await fetch(subscription.url, { method: "POST", headers: { "content-type": "application/json", "user-agent": "ZekerFlex-Webhooks/1.0", "x-zekerflex-event": eventType, "x-zekerflex-timestamp": timestamp, "x-zekerflex-signature": `v1=${signature(decryptWebhookSecret(subscription.secretCiphertext), timestamp, body)}` }, body, signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { attempts: attempt, statusCode: response.status, deliveredAt: new Date(), nextAttemptAt: null } });
        break;
      } catch (error) {
        lastError = (error as Error).message;
        await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { attempts: attempt, lastError, nextAttemptAt: attempt < 5 ? new Date(Date.now() + 2 ** attempt * 1000) : null } });
        if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
      }
    }
    if (lastError) console.warn(`[webhook] delivery failed after retries: ${subscription.url}`);
  }
}