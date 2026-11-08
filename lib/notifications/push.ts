import { prisma } from "@/lib/prisma";
import { z } from "zod";

const pushNotificationSchema = z.object({
  title: z.string().min(1).max(65),
  body: z.string().min(1).max(240),
  icon: z.string().url().optional(),
  image: z.string().url().optional(),
  badge: z.string().url().optional(),
  tag: z.string().optional(),
  actions: z.object({
    action: z.string(),
    title: z.string(),
    icon: z.string().url().optional(),
  }).array().optional(),
  data: z.record(z.any()).optional(),
  deepLink: z.string().optional(),
  expiresAt: z.date().optional(),
  requireInteraction: z.boolean().optional(),
  silent: z.boolean().optional(),
});

export type PushNotification = z.infer<typeof pushNotificationSchema>;

export async function sendPushNotification(userId: string, notification: PushNotification, tenantId: string) {
  const validated = pushNotificationSchema.parse(notification);

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId, tenantId },
  });

  if (subscriptions.length === 0) return { sent: 0, failed: 0 };

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        const payload = JSON.stringify({
          title: validated.title,
          body: validated.body,
          icon: validated.icon,
          image: validated.image,
          badge: validated.badge,
          tag: validated.tag,
          actions: validated.actions,
          data: validated.data,
          deepLink: validated.deepLink,
          requireInteraction: validated.requireInteraction,
        });

        await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "TTL": String(validated.expiresAt ? Math.floor((validated.expiresAt.getTime() - Date.now()) / 1000) : 86400),
          },
          body: payload,
        });

        await prisma.pushNotificationLog.create({
          data: {
            userId,
            tenantId,
            subscriptionId: sub.id,
            title: validated.title,
            body: validated.body,
            status: "SENT",
            sentAt: new Date(),
          },
        });

        return { success: true };
      } catch (error) {
        await prisma.pushNotificationLog.create({
          data: {
            userId,
            tenantId,
            subscriptionId: sub.id,
            title: validated.title,
            body: validated.body,
            status: "FAILED",
            error: String(error),
          },
        });
        return { success: false };
      }
    })
  );

  const sent = results.filter((r) => r.status === "fulfilled" && r.value.success).length;
  const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.success)).length;

  return { sent, failed };
}

export async function subscribeToNotifications(userId: string, tenantId: string, subscription: PushSubscriptionJSON) {
  return prisma.pushSubscription.upsert({
    where: {
      endpoint_userId: { endpoint: subscription.endpoint, userId },
    },
    create: {
      userId,
      tenantId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: subscription.userAgent,
    },
    update: {
      userAgent: subscription.userAgent,
      updatedAt: new Date(),
    },
  });
}

export async function unsubscribeFromNotifications(userId: string, endpoint: string) {
  return prisma.pushSubscription.deleteMany({
    where: { userId, endpoint },
  });
}

export async function getPushLogs(userId: string, tenantId: string, limit = 100) {
  return prisma.pushNotificationLog.findMany({
    where: { userId, tenantId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

type PushSubscriptionJSON = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
};
