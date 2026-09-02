import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isFcmEnabled, sendFcm } from "@/lib/notifications/push/fcm";
import {
  isWebPushEnabled,
  sendWebPush,
} from "@/lib/notifications/push/web-push";

// ---------------------------------------------------------------------------
// Push fan-out.
//
// A freelancer may have Web Push subscriptions (primary, self-hosted) and/or
// FCM tokens (optional). `sendShiftOffer` delivers over every channel it can,
// disables subscriptions/tokens the service reports as gone, and never throws.
// ---------------------------------------------------------------------------

export interface ShiftOfferPush {
  freelancerId: string;
  shiftId: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

const OFFER_TTL_SECONDS = 15 * 60;

export interface PushChannels {
  webPush: boolean;
  fcm: boolean;
}

/** Which push channels are configured platform-wide. */
export function pushChannels(): PushChannels {
  return { webPush: isWebPushEnabled(), fcm: isFcmEnabled() };
}

export async function sendShiftOffer(offer: ShiftOfferPush): Promise<boolean> {
  const notification = { title: offer.title, body: offer.body };
  const data = { ...offer.data, type: "SHIFT_OFFER", shiftId: offer.shiftId };

  const [subs, tokens] = await Promise.all([
    isWebPushEnabled()
      ? prisma.webPushSubscription.findMany({
          where: { freelancerId: offer.freelancerId, disabledAt: null },
        })
      : Promise.resolve([]),
    isFcmEnabled()
      ? prisma.pushToken.findMany({
          where: { freelancerId: offer.freelancerId, disabledAt: null },
          select: { token: true },
        })
      : Promise.resolve([] as { token: string }[]),
  ]);

  let delivered = 0;

  if (subs.length > 0) {
    const payload = JSON.stringify({ ...notification, data });
    const gone: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          const r = await sendWebPush(
            { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.authKey },
            payload,
            { ttlSeconds: OFFER_TTL_SECONDS },
          );
          if (r.ok) delivered += 1;
          else if (r.gone) gone.push(s.endpoint);
        } catch (err) {
          logger.warn("web push send failed", {
            endpoint: s.endpoint,
            error: (err as Error).message,
          });
        }
      }),
    );
    if (gone.length > 0) {
      await prisma.webPushSubscription.updateMany({
        where: { endpoint: { in: gone } },
        data: { disabledAt: new Date() },
      });
    }
  }

  if (tokens.length > 0) {
    const { successCount, deadTokens } = await sendFcm(
      tokens.map((t) => t.token),
      notification,
      data,
    );
    delivered += successCount;
    if (deadTokens.length > 0) {
      await prisma.pushToken.updateMany({
        where: { token: { in: deadTokens } },
        data: { disabledAt: new Date() },
      });
    }
  }

  if (delivered === 0) {
    logger.warn("shift offer not delivered on any channel", {
      freelancerId: offer.freelancerId,
      shiftId: offer.shiftId,
      webPushSubs: subs.length,
      fcmTokens: tokens.length,
    });
  }
  return delivered > 0;
}
