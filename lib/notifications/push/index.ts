import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordShiftOffer } from "@/lib/metrics";
import {
  isWebPushEnabled,
  pushServiceOf,
  sendWebPush,
} from "@/lib/notifications/push/web-push";
import { isApnsEnabled, sendApnsToUsers } from "@/lib/notifications/push/apns";
import { WORKER_PUSH, type WorkerPushTexts } from "@/lib/i18n/worker-push";
import { userLocale } from "@/lib/i18n/worker-locale";
import type { Locale } from "@/lib/i18n/config";

// ---------------------------------------------------------------------------
// Push fan-out.
//
// Web Push (self-hosted, no third party), plus APNs for the iPhone app
// (lib/notifications/push/apns.ts: straight to Apple, also no third party;
// Web Push does not work inside its WKWebView). FCM support
// was removed: it pulled in firebase-admin, which drags a critical CVE via
// its @google-cloud/* -> google-gax -> uuid dependency chain, for a channel
// nothing here ever configured (env.FIREBASE_* was always unset). If a
// native-app push channel is needed again later, re-add it as its own
// module rather than reviving firebase-admin.
// ---------------------------------------------------------------------------

export interface ShiftOfferPush {
  freelancerId: string;
  shiftId: string;
  /** titel en tekst in de app-taal van de werker (lib/i18n/worker-push.ts: offerTitle, offerBody) */
  teksten: (t: WorkerPushTexts, locale: Locale) => { title: string; body: string };
  data: Record<string, string>;
}

const OFFER_TTL_SECONDS = 15 * 60;

export interface PushChannels {
  webPush: boolean;
  /** pushmeldingen naar de iPhone-app (APNs) */
  apns: boolean;
}

/** Which push channels are configured platform-wide. */
export function pushChannels(): PushChannels {
  return { webPush: isWebPushEnabled(), apns: isApnsEnabled() };
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
          pushService: pushServiceOf(s.endpoint),
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
  // de werker: voor de taal van de melding (AGENTS.md: push aan een werker in zijn app-taal) en voor
  // de iPhone-app (APNs staat per account, niet per profiel); zonder bekende taal Nederlands
  const profiel = await prisma.freelancerProfile
    .findUnique({ where: { id: offer.freelancerId }, select: { userId: true } })
    .catch(() => null);
  const locale: Locale = profiel ? await userLocale(profiel.userId).catch((): Locale => "nl") : "nl";
  const notification = offer.teksten(WORKER_PUSH[locale], locale);
  const data = { ...offer.data, type: "SHIFT_OFFER", shiftId: offer.shiftId };

  const subs = isWebPushEnabled()
    ? await prisma.webPushSubscription.findMany({
        where: { freelancerId: offer.freelancerId, disabledAt: null },
        select: SEND_FIELDS,
      })
    : [];

  let delivered =
    subs.length > 0 ? await fanOut(subs, JSON.stringify({ ...notification, data }), OFFER_TTL_SECONDS) : 0;

  // de iPhone-app (APNs): de apparaatcodes staan per account, niet per profiel
  if (isApnsEnabled()) {
    if (profiel) {
      delivered += await sendApnsToUsers([profiel.userId], {
        ...notification,
        data: { ...data, url: "/dashboard/klussen", tag: offer.shiftId },
        ttlSeconds: OFFER_TTL_SECONDS,
      });
    }
  }

  // geen apparaat bereikt: de dispatcher stuurt dan een mail (lib/notifications/klus-mail.ts) en
  // waarschuwt zelf als die mislukt; dit is dus geen fout (was 46× "warn" in het foutenlogboek)
  if (delivered === 0) {
    logger.info("shift offer not delivered by push", {
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
  if (ids.length === 0) return 0;
  let delivered = 0;
  if (isWebPushEnabled()) {
    const subs = await prisma.webPushSubscription.findMany({
      where: { userId: { in: ids }, disabledAt: null },
      select: SEND_FIELDS,
    });
    if (subs.length > 0) {
      delivered += await fanOut(subs, JSON.stringify({ title: push.title, body: push.body, data: push.data }), push.ttlSeconds);
    }
  }
  // de iPhone-app: zelfde melding via Apple (doet niets zonder APNS_*-sleutels)
  if (isApnsEnabled()) delivered += await sendApnsToUsers(ids, push);
  return delivered;
}
