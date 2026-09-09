import { redis } from "@/lib/redis";
import { AppError } from "@/lib/errors";
import { recordRateLimited } from "@/lib/metrics";

// ---------------------------------------------------------------------------
// Shared fixed-window rate limiter.
//
// One Redis counter per key: the first hit in a window sets the TTL, the window
// then expires on its own. `ok` flips to false once the count passes `limit`.
//
// The per-IP / per-session / per-key limiters across the app all funnel through
// this. It does NOT cover the credentials-login brute-force guard
// (`lib/auth/login-throttle.ts`, which needs a separate lock and fails closed)
// or the AI budget governor (`lib/ai/governor.ts`, which queues rather than
// rejects).
// ---------------------------------------------------------------------------

export interface RateResult {
  /** false once the window's count has passed `limit`. */
  ok: boolean;
  /** running count within the current window (0 when Redis was unreachable). */
  count: number;
  limit: number;
  /** requests still allowed in this window (never negative). */
  remaining: number;
  /** rough seconds until the window resets; 0 while still under the limit. */
  retryAfterSeconds: number;
}

/**
 * Count one request against `key` in a `windowSeconds` fixed window.
 *
 * On any Redis fault the call fails open (`ok: true`) unless `failOpen` is set
 * to false, letting security-sensitive callers opt into fail-closed instead.
 */
export async function fixedWindow(
  key: string,
  limit: number,
  windowSeconds: number,
  options: { failOpen?: boolean } = {},
): Promise<RateResult> {
  const failOpen = options.failOpen ?? true;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    const ok = count <= limit;
    return {
      ok,
      count,
      limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: ok ? 0 : windowSeconds,
    };
  } catch {
    return {
      ok: failOpen,
      count: 0,
      limit,
      remaining: limit,
      retryAfterSeconds: 0,
    };
  }
}

export interface RateLimitSpec {
  /** Stable bucket name, e.g. "check-email" or "kyc-start". */
  name: string;
  /** Who is being limited: an IP (`clientIp(req)`), a userId, an API-key id. */
  identifier: string;
  limit: number;
  windowSeconds: number;
  /** Default true (a Redis fault lets the request through). */
  failOpen?: boolean;
  /** Message for the 429 body. */
  message?: string;
}

/**
 * Count one request and throw `AppError.rateLimited` (HTTP 429 + `Retry-After`)
 * when the window is exhausted. The single choke point every route should use:
 * it owns the key namespace (`rl:<name>:<identifier>`) and the response shape so
 * individual handlers stop hand-rolling both. Returns the `RateResult` when the
 * request is allowed, for callers that want to surface `X-RateLimit-*`.
 */
export async function enforceRateLimit(spec: RateLimitSpec): Promise<RateResult> {
  const gate = await fixedWindow(
    `rl:${spec.name}:${spec.identifier}`,
    spec.limit,
    spec.windowSeconds,
    spec.failOpen === undefined ? {} : { failOpen: spec.failOpen },
  );
  if (!gate.ok) {
    recordRateLimited(spec.name);
    throw AppError.rateLimited(spec.message, gate.retryAfterSeconds || spec.windowSeconds);
  }
  return gate;
}
