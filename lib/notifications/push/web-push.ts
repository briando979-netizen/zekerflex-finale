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

export async function sendWebPush(
  target: WebPushTarget,
  payload: string,
  opts: { ttlSeconds: number },
): Promise<WebPushResult> {
  if (!isWebPushEnabled()) {
    logger.warn("web push not configured; skipping", { endpoint: target.endpoint });
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

  const gone = res.status === 404 || res.status === 410;
  const ok = res.status >= 200 && res.status < 300;
  if (!ok && !gone) {
    logger.warn("web push rejected", {
      endpoint: target.endpoint,
      status: res.status,
    });
  }
  return { ok, statusCode: res.status, gone };
}
