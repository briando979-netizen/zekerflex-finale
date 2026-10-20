import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

// ---------------------------------------------------------------------------
// Speed & cost watch. On Vercel the bill and the slowness come from three
// places: function invocations × duration, the Postgres size (Neon), and the
// Redis memory. The in-process Prometheus counters reset on every cold start,
// so this keeps durable daily counters in Redis for the hot paths, and reads
// the storage sizes straight from Postgres and Redis.
//   use:d:<YYYY-MM-DD>  hash  "<name>:n" | ":ms" | ":err" | ":max"  (40 days)
// ---------------------------------------------------------------------------

const DAY_TTL = 40 * 86_400;
const day = (d = new Date()) => d.toISOString().slice(0, 10);

/** Record one invocation of a tracked path. Never throws. */
export async function trackUsage(name: string, ms: number, ok: boolean): Promise<void> {
  try {
    const key = `use:d:${day()}`;
    const t = Math.max(0, Math.round(ms));
    const p = redis.multi().hincrby(key, `${name}:n`, 1).hincrby(key, `${name}:ms`, t);
    if (!ok) p.hincrby(key, `${name}:err`, 1);
    p.expire(key, DAY_TTL);
    await p.exec();
    const prev = Number(await redis.hget(key, `${name}:max`)) || 0;
    if (t > prev) await redis.hset(key, `${name}:max`, t);
  } catch {
    /* measuring must never break the request */
  }
}

/** Wrap a route handler: times it and records ok / error (status >= 500 counts as error). */
export function withUsage<A extends unknown[]>(name: string, handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    const t0 = Date.now();
    try {
      const res = await handler(...args);
      void trackUsage(name, Date.now() - t0, res.status < 500);
      return res;
    } catch (err) {
      void trackUsage(name, Date.now() - t0, false);
      throw err;
    }
  };
}

export interface RouteUsage {
  name: string;
  calls: number;
  avgMs: number;
  maxMs: number;
  errors: number;
}

export interface UsageSnapshot {
  today: RouteUsage[];
  week: RouteUsage[];
  db: { totalMb: number; tables: { name: string; mb: number; rows: number }[] } | null;
  redis: { usedMb: number; keys: number } | null;
  warnings: string[];
}

async function routesFor(days: string[]): Promise<RouteUsage[]> {
  const agg = new Map<string, { n: number; ms: number; err: number; max: number }>();
  for (const d of days) {
    const h = await redis.hgetall(`use:d:${d}`).catch(() => ({}) as Record<string, string>);
    for (const [k, v] of Object.entries(h)) {
      const i = k.lastIndexOf(":");
      const name = k.slice(0, i);
      const field = k.slice(i + 1);
      const a = agg.get(name) ?? { n: 0, ms: 0, err: 0, max: 0 };
      const num = Number(v) || 0;
      if (field === "n") a.n += num;
      else if (field === "ms") a.ms += num;
      else if (field === "err") a.err += num;
      else if (field === "max") a.max = Math.max(a.max, num);
      agg.set(name, a);
    }
  }
  return [...agg.entries()]
    .map(([name, a]) => ({ name, calls: a.n, avgMs: a.n ? Math.round(a.ms / a.n) : 0, maxMs: a.max, errors: a.err }))
    .sort((x, y) => y.calls - x.calls);
}

const LIMIT_DB_MB = Number(process.env.USAGE_WARN_DB_MB ?? 450); // e.g. Neon free tier = 0.5 GB
const LIMIT_REDIS_MB = Number(process.env.USAGE_WARN_REDIS_MB ?? 200);
const SLOW_MS = 2_000;

export async function usageSnapshot(): Promise<UsageSnapshot> {
  const days = Array.from({ length: 7 }, (_, i) => day(new Date(Date.now() - i * 86_400_000)));
  const [today, week] = await Promise.all([routesFor([days[0]!]), routesFor(days)]);

  let db: UsageSnapshot["db"] = null;
  try {
    const [size] = await prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`;
    const tables = await prisma.$queryRaw<{ name: string; bytes: bigint; rows: bigint }[]>`
      SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes, GREATEST(c.reltuples, 0)::bigint AS rows
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND n.nspname = current_schema()
      ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 8`;
    db = {
      totalMb: Math.round(Number(size?.bytes ?? 0) / 1_048_576),
      tables: tables.map((t) => ({ name: t.name, mb: Math.round((Number(t.bytes) / 1_048_576) * 10) / 10, rows: Number(t.rows) })),
    };
  } catch {
    db = null;
  }

  let redisInfo: UsageSnapshot["redis"] = null;
  try {
    const info = await redis.info("memory");
    const used = Number(/used_memory:(\d+)/.exec(info)?.[1] ?? 0);
    redisInfo = { usedMb: Math.round((used / 1_048_576) * 10) / 10, keys: await redis.dbsize() };
  } catch {
    redisInfo = null;
  }

  const warnings: string[] = [];
  if (db && db.totalMb > LIMIT_DB_MB) warnings.push(`De database is ${db.totalMb} MB — boven de waarschuwingsgrens van ${LIMIT_DB_MB} MB. Kijk welke tabel groeit (vaak analytics of uploads) of kies een groter abonnement.`);
  if (redisInfo && redisInfo.usedMb > LIMIT_REDIS_MB) warnings.push(`Redis gebruikt ${redisInfo.usedMb} MB — boven de grens van ${LIMIT_REDIS_MB} MB.`);
  for (const r of today) {
    if (r.calls >= 20 && r.avgMs > SLOW_MS) warnings.push(`${r.name} is traag vandaag: gemiddeld ${r.avgMs} ms over ${r.calls} aanroepen.`);
    if (r.calls >= 20 && r.errors / r.calls > 0.05) warnings.push(`${r.name} geeft vaak fouten vandaag: ${r.errors} van ${r.calls}.`);
  }
  return { today, week, db, redis: redisInfo, warnings };
}
