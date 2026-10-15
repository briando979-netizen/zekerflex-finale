import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordShiftOffer } from "@/lib/metrics";
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

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  authKey: string;
}

const SEND_FIELDS = { endpoint: true, p256dh: true, authKey: true } as const;

/** Sends one payload to every subscription; disables the ones the push service reports gone. */
async function fanOut(subs: StoredSubscription[], payload: string, ttlSeconds: number): Promise<number> {
  let delivered = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        const r = await sendWebPush(
          { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.authKey },
          payload,
          { ttlSeconds },
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
  return delivered;
}

export async function sendShiftOffer(offer: ShiftOfferPush): Promise<boolean> {
  const notification = { title: offer.title, body: offer.body };
  const data = { ...offer.data, type: "SHIFT_OFFER", shiftId: offer.shiftId };

  const subs = isWebPushEnabled()
    ? await prisma.webPushSubscription.findMany({
        where: { freelancerId: offer.freelancerId, disabledAt: null },
        select: SEND_FIELDS,
      })
    : [];

  const delivered =
    subs.length > 0 ? await fanOut(subs, JSON.stringify({ ...notification, data }), OFFER_TTL_SECONDS) : 0;

  if (delivered === 0) {
    logger.warn("shift offer not delivered on any channel", {
      freelancerId: offer.freelancerId,
      shiftId: offer.shiftId,
      webPushSubs: subs.length,
    });
  }
  recordShiftOffer(delivered > 0);
  return delivered > 0;
}

export interface UserPush {
  title: string;
  body: string;
  /** Read by public/sw.js: type, url, tag, … (all strings). */
  data: Record<string, string>;
  /** How long the push service may hold it for an offline device. */
  ttlSeconds: number;
}

/** Pushes to every device of the given accounts. Returns how many devices accepted it. */
export async function sendUserPush(userIds: string[], push: UserPush): Promise<number> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0 || !isWebPushEnabled()) return 0;
  const subs = await prisma.webPushSubscription.findMany({
    where: { userId: { in: ids }, disabledAt: null },
    select: SEND_FIELDS,
  });
  if (subs.length === 0) return 0;
  return fanOut(subs, JSON.stringify({ title: push.title, body: push.body, data: push.data }), push.ttlSeconds);
}
