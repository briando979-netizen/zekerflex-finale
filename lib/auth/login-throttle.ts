import { redis } from "@/lib/redis";

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

/** Check whether login attempts for this identifier are currently locked out. */
export async function checkLoginAllowed(identifier: string): Promise<LoginGate> {
  const ttl = await redis.ttl(lockKey(identifier));
  return ttl > 0
    ? { allowed: false, retryAfterSeconds: ttl }
    : { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Register a failed attempt. Returns the running failure count and whether this
 * failure tripped the lock.
 */
export async function registerLoginFailure(
  identifier: string,
): Promise<{ failures: number; locked: boolean }> {
  const key = failKey(identifier);
  const failures = await redis.incr(key);
  if (failures === 1) await redis.expire(key, WINDOW_SECONDS);
  if (failures >= MAX_FAILURES) {
    await redis.set(lockKey(identifier), "1", "EX", LOCK_SECONDS);
    await redis.del(key);
    return { failures, locked: true };
  }
  return { failures, locked: false };
}

/** Clear the failure counter and any lock (called on a successful login). */
export async function clearLoginFailures(identifier: string): Promise<void> {
  await redis.del(failKey(identifier), lockKey(identifier));
}
