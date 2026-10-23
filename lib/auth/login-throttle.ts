import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Brute-force / credential-stuffing protection for the credentials provider.
//
// Failed attempts are counted per identifier (lower-cased e-mail) in a rolling
// window. Crossing the threshold sets a short lock that must expire before any
// further attempt is evaluated. A successful login clears both keys.
//
// This is the safe, real core of "cyber defense" - edge-layer WAF / DDoS
// mitigation belongs in front of the app (reverse proxy), not here.
// ---------------------------------------------------------------------------

export const MAX_FAILURES = 5;
const WINDOW_SECONDS = 15 * 60;
const LOCK_SECONDS = 15 * 60;

const failKey = (id: string) => `zf:login:fail:${id}`;
const lockKey = (id: string) => `zf:login:lock:${id}`;

export interface LoginGate {
  allowed: boolean;
  retryAfterSeconds: number;
}

// Brute-force protection must FAIL OPEN: a Redis hiccup may never make logging
// in impossible. Every Redis call here is wrapped so a fault degrades to
// "allowed / not counted", never to a thrown error that authorize would turn
// into a generic "invalid credentials" for every account.

/** Check whether login attempts for this identifier are currently locked out. */
export async function checkLoginAllowed(identifier: string): Promise<LoginGate> {
  try {
    const ttl = await redis.ttl(lockKey(identifier));
    return ttl > 0
      ? { allowed: false, retryAfterSeconds: ttl }
      : { allowed: true, retryAfterSeconds: 0 };
  } catch (err) {
    logger.warn("login throttle unavailable — allowing login (fail-open)", { error: (err as Error).message });
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/**
 * Register a failed attempt. Returns the running failure count and whether this
 * failure tripped the lock. Fails open (no count) on a Redis fault.
 */
export async function registerLoginFailure(
  identifier: string,
): Promise<{ failures: number; locked: boolean }> {
  try {
    const key = failKey(identifier);
    const failures = await redis.incr(key);
    if (failures === 1) await redis.expire(key, WINDOW_SECONDS);
    if (failures >= MAX_FAILURES) {
      await redis.set(lockKey(identifier), "1", "EX", LOCK_SECONDS);
      await redis.del(key);
      return { failures, locked: true };
    }
    return { failures, locked: false };
  } catch (err) {
    logger.warn("login throttle write failed (fail-open)", { error: (err as Error).message });
    return { failures: 0, locked: false };
  }
}

/** Clear the failure counter and any lock (called on a successful login). */
export async function clearLoginFailures(identifier: string): Promise<void> {
  try {
    await redis.del(failKey(identifier), lockKey(identifier));
  } catch {
    /* best effort */
  }
}
