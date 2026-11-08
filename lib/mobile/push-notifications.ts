/**
 * Push Notifications Subsystem
 *
 * Web Push API integration with VAPID support. Handles subscription management,
 * opt-in tracking, and fallback strategies. FCM removed (see lib/notifications/push/index.ts).
 */

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface PushSubscriptionJson {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// ===== Subscription Management =====

/**
 * Check if Web Push is available in this browser
 */
export function isWebPushAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window;
}

/**
 * Request notification permission and subscribe to push.
 * Returns true if permission was granted and subscription succeeded.
 */
export async function subscribeToPush(userId: string): Promise<boolean> {
  if (!isWebPushAvailable()) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      logger.info("Push permission denied");
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
      ),
    });

    // Send to server
    await fetch("/api/mobile/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        userId,
      }),
    });

    logger.info("Subscribed to push", { userId });

    // Track opt-in in DB
    await prisma.mobileUser.update({
      where: { userId },
      data: { pushOptedIn: true },
    }).catch(() => {
      /* Ignore if no mobile user record yet */
    });

    return true;
  } catch (error) {
    logger.error("Push subscription failed", {
      error: (error as Error).message,
      userId,
    });
    return false;
  }
}

/**
 * Unsubscribe from push and mark as opted out
 */
export async function unsubscribeFromPush(userId: string): Promise<boolean> {
  if (!isWebPushAvailable()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();

      // Notify server
      await fetch("/api/mobile/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          userId,
        }),
      });

      logger.info("Unsubscribed from push", { userId });
    }

    // Mark opted out in DB
    await prisma.mobileUser.update({
      where: { userId },
      data: { pushOptedIn: false },
    }).catch(() => {
      /* Ignore if no mobile user record yet */
    });

    return true;
  } catch (error) {
    logger.error("Push unsubscription failed", {
      error: (error as Error).message,
      userId,
    });
    return false;
  }
}

/**
 * Get current push subscription status
 */
export async function getPushStatus(): Promise<{
  subscribed: boolean;
  permission: NotificationPermission | null;
  endpoint: string | null;
}> {
  if (!isWebPushAvailable()) {
    return { subscribed: false, permission: null, endpoint: null };
  }

  try {
    const permission = Notification.permission;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    return {
      subscribed: !!subscription,
      permission,
      endpoint: subscription?.endpoint ?? null,
    };
  } catch {
    return { subscribed: false, permission: null, endpoint: null };
  }
}

// ===== Opt-In Tracking =====

/**
 * Record push opt-in preference in database
 */
export async function recordPushOptIn(
  userId: string,
  optedIn: boolean,
  source: "auto" | "user" | "banner" = "user",
): Promise<void> {
  try {
    // Create or update mobile user record
    await prisma.mobileUser.upsert({
      where: { userId },
      create: {
        userId,
        pushOptedIn: optedIn,
        optInSource: source,
      },
      update: {
        pushOptedIn: optedIn,
        optInSource: source,
        lastOptInAt: new Date(),
      },
    });

    logger.info("Push opt-in recorded", { userId, optedIn, source });
  } catch (error) {
    logger.warn("Failed to record push opt-in", {
      error: (error as Error).message,
      userId,
    });
  }
}

/**
 * Get push opt-in preference for user
 */
export async function getPushOptInStatus(userId: string): Promise<boolean> {
  try {
    const user = await prisma.mobileUser.findUnique({
      where: { userId },
      select: { pushOptedIn: true },
    });
    return user?.pushOptedIn ?? false;
  } catch {
    return false;
  }
}

// ===== Server-Side Subscription Storage =====

/**
 * Store subscription in database (called by /api/mobile/push/subscribe)
 */
export async function storeSubscription(
  userId: string,
  subscription: PushSubscriptionJson,
  userAgent?: string,
): Promise<void> {
  try {
    const { endpoint, keys } = subscription;

    await prisma.mobilePushSubscription.upsert({
      where: { endpoint },
      create: {
        userId,
        endpoint,
        p256dh: keys.p256dh,
        authKey: keys.auth,
        userAgent: userAgent || "unknown",
        platform: detectPlatform(userAgent),
        browserName: detectBrowser(userAgent),
      },
      update: {
        userId,
        optedIn: true,
        disabledAt: null,
        lastActiveAt: new Date(),
      },
    });

    logger.info("Subscription stored", { userId, endpoint: endpoint.substring(0, 20) + "..." });
  } catch (error) {
    logger.error("Failed to store subscription", {
      error: (error as Error).message,
      userId,
    });
  }
}

/**
 * Disable subscription (called when push service reports it's dead)
 */
export async function disableSubscription(endpoint: string): Promise<void> {
  try {
    await prisma.mobilePushSubscription.update({
      where: { endpoint },
      data: { disabledAt: new Date() },
    });
  } catch {
    /* Subscription may not exist */
  }
}

/**
 * Get all active subscriptions for a user
 */
export async function getUserSubscriptions(userId: string) {
  try {
    return await prisma.mobilePushSubscription.findMany({
      where: {
        userId,
        optedIn: true,
        disabledAt: null,
      },
      select: {
        endpoint: true,
        p256dh: true,
        authKey: true,
      },
    });
  } catch (error) {
    logger.warn("Failed to get user subscriptions", {
      error: (error as Error).message,
      userId,
    });
    return [];
  }
}

/**
 * Clean up old disabled subscriptions (run in cron)
 */
export async function cleanupDisabledSubscriptions(): Promise<number> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await prisma.mobilePushSubscription.deleteMany({
      where: {
        disabledAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    logger.info("Cleaned up disabled subscriptions", { count: result.count });
    return result.count;
  } catch (error) {
    logger.error("Cleanup failed", {
      error: (error as Error).message,
    });
    return 0;
  }
}

// ===== Utilities =====

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function detectPlatform(userAgent?: string): string | null {
  if (!userAgent) return null;
  if (userAgent.includes("Android")) return "android";
  if (userAgent.includes("iPhone") || userAgent.includes("iPad")) return "ios";
  return "web";
}

function detectBrowser(userAgent?: string): string | null {
  if (!userAgent) return null;
  if (userAgent.includes("Chrome")) return "chrome";
  if (userAgent.includes("Firefox")) return "firefox";
  if (userAgent.includes("Safari")) return "safari";
  if (userAgent.includes("Edge")) return "edge";
  return null;
}

// Model for tracking user preferences
export interface MobileUser {
  userId: string;
  pushOptedIn: boolean;
  optInSource?: "auto" | "user" | "banner";
  lastOptInAt?: Date;
}
