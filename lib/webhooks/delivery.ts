import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { RETRY_SCHEDULE } from "@/lib/events/publisher";

export async function deliverWebhooks(): Promise<void> {
  // Find all deliveries that are due to retry
  const pendingDeliveries = await prisma.webhookDelivery.findMany({
    where: {
      nextAttemptAt: { lte: new Date() },
      deliveredAt: null,
      attempts: { lt: RETRY_SCHEDULE.length },
    },
    include: { subscription: true },
    take: 100,
  });

  for (const delivery of pendingDeliveries) {
    await attemptDelivery(delivery);
  }
}

async function attemptDelivery(delivery: any): Promise<void> {
  const { subscription } = delivery;
  const secretCiphertext = subscription.secretCiphertext;
  const secret = secretCiphertext ? Buffer.from(secretCiphertext, "base64").toString() : "";

  // Create HMAC signature
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${delivery.id}.${timestamp}`)
    .digest("hex");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "ZekerFlex/1.0",
    "X-Webhook-ID": delivery.id,
    "X-Webhook-Timestamp": timestamp.toString(),
    "X-Webhook-Signature": secret ? `sha256=${signature}` : "",
  };

  try {
    const response = await fetch(subscription.url, {
      method: "POST",
      headers,
      body: JSON.stringify(delivery.payload),
      timeout: 30000,
    });

    const statusCode = response.status;
    const success = statusCode >= 200 && statusCode < 300;

    const nextAttempt =
      delivery.attempts < RETRY_SCHEDULE.length - 1
        ? new Date(Date.now() + RETRY_SCHEDULE[delivery.attempts + 1] * 1000)
        : null;

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        statusCode,
        attempts: { increment: 1 },
        deliveredAt: success ? new Date() : null,
        nextAttemptAt: success ? null : nextAttempt,
        lastError: success ? null : `HTTP ${statusCode}`,
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    const nextAttempt =
      delivery.attempts < RETRY_SCHEDULE.length - 1
        ? new Date(Date.now() + RETRY_SCHEDULE[delivery.attempts + 1] * 1000)
        : null;

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempts: { increment: 1 },
        nextAttemptAt: nextAttempt,
        lastError: errorMsg,
      },
    });
  }
}

export async function replayEvent(deliveryId: string): Promise<void> {
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      attempts: 0,
      nextAttemptAt: new Date(),
      deliveredAt: null,
      statusCode: null,
      lastError: null,
    },
  });
}
