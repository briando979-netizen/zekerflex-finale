import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  isWebPushEnabled,
  sendWebPush,
} from "@/lib/notifications/push/web-push";

// ---------------------------------------------------------------------------
// Push fan-out.
//
// Web Push (self-hosted, no third party) is the only channel. FCM support
// was removed: it pulled in firebase-admin, which drags a critical CVE via
// its @google-cloud/* -> google-gax -> uuid dependency chain, for a channel
// nothing here ever configured (env.FIREBASE_* was always unset). If a
// native-app push channel is needed again later, re-add it as its own
// module rather than reviving firebase-admin.
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
}

/** Which push channels are configured platform-wide. */
export function pushChannels(): PushChannels {
  return { webPush: isWebPushEnabled() };
}

export async function sendShiftOffer(offer: ShiftOfferPush): Promise<boolean> {
  const notification = { title: offer.title, body: offer.body };
  const data = { ...offer.data, type: "SHIFT_OFFER", shiftId: offer.shiftId };

  const subs = isWebPushEnabled()
    ? await prisma.webPushSubscription.findMany({
        where: { freelancerId: offer.freelancerId, disabledAt: null },
      })
    : [];

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

  if (delivered === 0) {
    logger.warn("shift offer not delivered on any channel", {
      freelancerId: offer.freelancerId,
      shiftId: offer.shiftId,
      webPushSubs: subs.length,
    });
  }
  return delivered > 0;
}
