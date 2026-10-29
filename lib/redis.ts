import Redis from "ioredis";
import { env } from "@/lib/env";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

if (env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

/**
 * Acquire a short-lived distributed lock. Used by the matching engine to avoid
 * two workers auto-assigning the same shift, and by check-in handling to
 * serialise geofence evaluation per timesheet.
 *
 * @returns an unlock function, or `null` when the lock is already held.
 */
export async function acquireLock(
  key: string,
  ttlMs: number,
): Promise<(() => Promise<void>) | null> {
  const token = crypto.randomUUID();
  let ok: string | null;
  try {
    ok = await redis.set(`lock:${key}`, token, "PX", ttlMs, "NX");
  } catch (err) {
    // Redis onbereikbaar of over quota: faal OPEN. Deze lock is een extra
    // waarborg tegen gelijktijdig dubbel uitvoeren; de aanroepers hebben zelf
    // een status-guard (bijv. timesheet SUBMITTED→APPROVED), dus een kapotte
    // Redis mag een goedkeuring/uitbetaling niet volledig blokkeren — net als
    // bij de login-lockout die open faalt wanneer Redis wegvalt.
    console.warn(`acquireLock: Redis niet beschikbaar voor "${key}", ga door zonder lock:`, (err as Error).message);
    return async () => {};
  }
  if (ok !== "OK") return null;

  return async () => {
    // Only release the lock if we still own it (compare-and-delete).
    const script =
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    try {
      await redis.eval(script, 1, `lock:${key}`, token);
    } catch {
      // Lock verloopt vanzelf via TTL; een fout bij vrijgeven mag niets breken.
    }
  };
}

/** JSON-serialising cache helper with a TTL in seconds. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  produce: () => Promise<T>,
): Promise<T> {
  // Fail-open: een cache is nooit kritiek. Valt Redis weg of is het quotum vol
  // ("max requests limit exceeded"), dan berekenen we gewoon opnieuw i.p.v. te
  // gooien — net als de login-lockout en acquireLock.
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch (err) {
    console.warn(`cached: Redis-get faalde voor "${key}", bereken opnieuw:`, (err as Error).message);
  }
  const value = await produce();
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Cache-set faalde (quotum/onbereikbaar) — niet fataal, we hebben de waarde al.
  }
  return value;
}

/** Atomically claims an event for a bounded idempotency window. */
export async function claimIdempotency(key: string, ttlSeconds: number): Promise<boolean> {
  const result = await redis.set(`idempotency:${key}`, "1", "EX", ttlSeconds, "NX");
  return result === "OK";
}

type CircuitState = { failures: number; openedUntil: number };
const circuitStates = new Map<string, CircuitState>();

/** Small process-local circuit breaker for outbound calls. */
export async function withCircuitBreaker<T>(
  name: string,
  operation: () => Promise<T>,
  options: { failureThreshold?: number; resetMs?: number } = {},
): Promise<T> {
  const failureThreshold = options.failureThreshold ?? 3;
  const resetMs = options.resetMs ?? 30_000;
  const state = circuitStates.get(name) ?? { failures: 0, openedUntil: 0 };
  if (state.openedUntil > Date.now()) {
    throw new Error(`${name} circuit is open`);
  }

  try {
    const result = await operation();
    circuitStates.delete(name);
    return result;
  } catch (error) {
    state.failures += 1;
    if (state.failures >= failureThreshold) state.openedUntil = Date.now() + resetMs;
    circuitStates.set(name, state);
    throw error;
  }
}
