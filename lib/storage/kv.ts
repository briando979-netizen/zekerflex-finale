import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Generic JSON key-value store (KeyValueStore table) — a drop-in replacement
// for "one JSON file per entity" on local disk, which is unreliable on
// Vercel's serverless functions (filesystem read-only outside /tmp, /tmp not
// shared across invocations). Keys mirror the old file paths, e.g. a file at
// storage/reviews/<userId>.json becomes the key "reviews:<userId>".
// ---------------------------------------------------------------------------

export async function kvGet<T>(key: string): Promise<T | null> {
  const row = await prisma.keyValueStore.findUnique({ where: { key } });
  return row ? (row.value as T) : null;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const json = value as Prisma.InputJsonValue;
  await prisma.keyValueStore.upsert({
    where: { key },
    create: { key, value: json },
    update: { value: json },
  });
}

export async function kvDelete(key: string): Promise<void> {
  await prisma.keyValueStore.deleteMany({ where: { key } });
}

/** Keys that share the given prefix, most-recently-updated first — the KV equivalent of readdir(). */
export async function kvListKeys(prefix: string, limit = 1000): Promise<string[]> {
  const rows = await prisma.keyValueStore.findMany({
    where: { key: { startsWith: prefix } },
    select: { key: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => r.key);
}

/** Values for every key sharing the given prefix, most-recently-updated first. */
export async function kvListValues<T>(prefix: string, limit = 1000): Promise<T[]> {
  const rows = await prisma.keyValueStore.findMany({
    where: { key: { startsWith: prefix } },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => r.value as T);
}

/** (key, value) pairs for every key sharing the given prefix — for callers that need the key itself (e.g. an id encoded in it). */
export async function kvListEntries<T>(prefix: string, limit = 1000): Promise<{ key: string; value: T }[]> {
  const rows = await prisma.keyValueStore.findMany({
    where: { key: { startsWith: prefix } },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({ key: r.key, value: r.value as T }));
}

const likePrefix = (prefix: string) => `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Values under `prefix` whose top-level JSON `field` equals `equals` —
 * filtered in Postgres, so it stays correct and fast with millions of rows
 * (unlike kvListValues + a JS filter, which silently misses rows past its
 * limit). Backed by expression indexes for the hot fields (accountId,
 * referrerId, status) — see migration 20261018120000_scale_indexes.
 */
export async function kvFindByField<T>(prefix: string, field: string, equals: string, limit = 500): Promise<T[]> {
  const rows = await prisma.$queryRaw<{ value: unknown }[]>`
    SELECT value FROM "KeyValueStore"
    WHERE key LIKE ${likePrefix(prefix)} AND value->>${field} = ${equals}
    ORDER BY "updatedAt" DESC
    LIMIT ${limit}`;
  return rows.map((r) => r.value as T);
}

/**
 * Values under `prefix` whose ISO-date `field` is due (<= `beforeIso`),
 * oldest first — for the daily jobs, which page through with `afterKey`.
 * ISO-8601 strings sort chronologically, so a text comparison is exact.
 */
export async function kvFindDue<T>(prefix: string, field: string, beforeIso: string, afterKey = "", limit = 500): Promise<{ key: string; value: T }[]> {
  const rows = await prisma.$queryRaw<{ key: string; value: unknown }[]>`
    SELECT key, value FROM "KeyValueStore"
    WHERE key LIKE ${likePrefix(prefix)} AND key > ${afterKey} AND value->>${field} <= ${beforeIso}
    ORDER BY key
    LIMIT ${limit}`;
  return rows.map((r) => ({ key: r.key, value: r.value as T }));
}

/**
 * Read-modify-write append to a JSON array stored at `key`. Not a true atomic
 * append under heavy concurrency (same limitation the original appendFile-to-
 * a-shared-file code had), but fine for these low-traffic, per-user logs.
 */
export async function kvAppend<T>(key: string, item: T, keepLast = 2000): Promise<void> {
  const arr = (await kvGet<T[]>(key)) ?? [];
  arr.push(item);
  await kvSet(key, arr.length > keepLast ? arr.slice(arr.length - keepLast) : arr);
}
