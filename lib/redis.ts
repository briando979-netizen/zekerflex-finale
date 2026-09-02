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
  const ok = await redis.set(`lock:${key}`, token, "PX", ttlMs, "NX");
  if (ok !== "OK") return null;

  return async () => {
    // Only release the lock if we still own it (compare-and-delete).
    const script =
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    await redis.eval(script, 1, `lock:${key}`, token);
  };
}

/** JSON-serialising cache helper with a TTL in seconds. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  produce: () => Promise<T>,
): Promise<T> {
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit) as T;
  const value = await produce();
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  return value;
}
