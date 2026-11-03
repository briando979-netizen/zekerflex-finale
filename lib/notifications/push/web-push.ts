import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { encryptPayload } from "@/lib/notifications/push/encrypt";
import { vapidAuthorization, type VapidKeys } from "@/lib/notifications/push/vapid";

// ---------------------------------------------------------------------------
// Self-hosted Web Push sender (RFC 8291). The platform encrypts the payload
// and signs a VAPID token itself; the only outbound call is a plain POST to
// the subscription's push-service endpoint. No SDK, no vendor account.
// ---------------------------------------------------------------------------

const SEND_TIMEOUT_MS = 10_000;

export function isWebPushEnabled(): boolean {
  return Boolean(
    env.WEBPUSH_VAPID_PUBLIC_KEY && env.WEBPUSH_VAPID_PRIVATE_KEY,
  );
}

function vapidKeys(): VapidKeys {
  return {
    publicKey: env.WEBPUSH_VAPID_PUBLIC_KEY as string,
    privateKey: env.WEBPUSH_VAPID_PRIVATE_KEY as string,
  };
}

export interface WebPushTarget {
  endpoint: string;
  /** base64url client public key. */
  p256dh: string;
  /** base64url client auth secret. */
  auth: string;
}

export interface WebPushResult {
  ok: boolean;
  statusCode: number;
  /** Subscription is permanently gone (404/410) - caller should disable it. */
  gone: boolean;
}

/** For logs: only the push service's host. The endpoint itself is a per-device capability URL. */
export function pushServiceOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "onbekend";
  }
}

export async function sendWebPush(
  target: WebPushTarget,
  payload: string,
  opts: { ttlSeconds: number },
): Promise<WebPushResult> {
  if (!isWebPushEnabled()) {
    logger.warn("web push not configured; skipping", { pushService: pushServiceOf(target.endpoint) });
    return { ok: false, statusCode: 0, gone: false };
  }

  const origin = new URL(target.endpoint).origin;
  const body = encryptPayload({
    payload: Buffer.from(payload, "utf8"),
    clientPublicKey: Buffer.from(target.p256dh, "base64url"),
    authSecret: Buffer.from(target.auth, "base64url"),
  });
  const authorization = await vapidAuthorization({
    audience: origin,
    subject: env.WEBPUSH_CONTACT,
    keys: vapidKeys(),
  });

  const res = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(Math.max(0, Math.floor(opts.ttlSeconds))),
      Urgency: "high",
    },
    // Wrap the encrypted bytes in a Blob - unambiguously a BodyInit across the
    // DOM / undici fetch type variants.
    body: new Blob([new Uint8Array(body)], {
      type: "application/octet-stream",
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  const ok = res.status >= 200 && res.status < 300;
  // why: Apple answers {"reason":"BadJwtToken"}, FCM a short text, WNS a header
  const why = ok ? "" : ((await res.text().catch(() => "")) || res.headers.get("x-wns-error-description") || "").trim().slice(0, 200);
  // made with another VAPID key (an old one, or a dev server's): it can never receive ours again
  const otherKey = !ok && OTHER_KEY.test(why);
  const gone = res.status === 404 || res.status === 410 || otherKey;
  if (otherKey) logger.info("web push subscription has another VAPID key; disabled", { pushService: pushServiceOf(target.endpoint), status: res.status });
  else if (!ok && !gone) {
    logger.warn("web push rejected", {
      pushService: pushServiceOf(target.endpoint),
      status: res.status,
      ...(why ? { reason: why } : {}),
    });
  }
  return { ok, statusCode: res.status, gone };
}

/** How Apple, WNS, FCM and Mozilla say the subscription belongs to another VAPID key (seen live on 3 Nov for Apple and WNS). */
const OTHER_KEY = /VapidPkHashMismatch|public key used to sign JWT does not match|does not correspond to the sender ID|VAPID public key mismatch/i;
