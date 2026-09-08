import { redis } from "@/lib/redis";

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
