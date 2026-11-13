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

/** Values for several keys in one query; keys without a row are simply absent from the map. */
export async function kvGetMany<T>(keys: string[]): Promise<Map<string, T>> {
  if (keys.length === 0) return new Map();
  const rows = await prisma.keyValueStore.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } });
  return new Map(rows.map((r) => [r.key, r.value as T]));
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const json = value as Prisma.InputJsonValue;
  await prisma.keyValueStore.upsert({
    where: { key },
    create: { key, value: json },
    update: { value: json },
  });
}

/**
 * Alleen schrijven als de sleutel er nog niet is (INSERT ... ON CONFLICT DO NOTHING). Geeft true als wij hem schreven, false als
 * iemand eerder was: dan blijft diens waarde staan. Voor een slot of een verzoek dat niet overschreven mag worden.
 */
export async function kvSetIfAbsent(key: string, value: unknown): Promise<boolean> {
  const res = await prisma.keyValueStore.createMany({ data: [{ key, value: value as Prisma.InputJsonValue }], skipDuplicates: true });
  return res.count === 1;
}

/** Verwijdert de sleutel alleen als `value->>veld` gelijk is aan `waarde` (bv. een slot dat nog van jou is). Geeft true bij een verwijderde rij. */
export async function kvVerwijderAlsVeld(key: string, veld: string, waarde: string): Promise<boolean> {
  const n = await prisma.$executeRaw`DELETE FROM "KeyValueStore" WHERE key = ${key} AND value->>${veld} = ${waarde}`;
  return n === 1;
}

/** Atomisch vervangen (compare-and-swap): alleen als `value->>veld` nog `oud` is (null = het veld ontbrak). Geeft true als wij het deden. */
export async function kvVervangAlsVeld(key: string, veld: string, oud: string | null, nieuw: unknown): Promise<boolean> {
  const json = JSON.stringify(nieuw);
  const n = await prisma.$executeRaw`UPDATE "KeyValueStore" SET value = ${json}::jsonb, "updatedAt" = now() WHERE key = ${key} AND value->>${veld} IS NOT DISTINCT FROM ${oud}::text`;
  return n === 1;
}

export async function kvDelete(key: string): Promise<void> {
  await prisma.keyValueStore.deleteMany({ where: { key } });
}

/**
 * Delete every key under `prefix` that was last written before `before` — one
 * query for a retention sweep, without loading the values. The prefix must be
 * a real namespace ("name:"), so a slip can never empty the whole store.
 */
export async function kvDeleteStale(prefix: string, before: Date): Promise<number> {
  if (!/^[a-z0-9][a-z0-9-]*:/.test(prefix)) throw new Error(`kvDeleteStale: ongeldig voorvoegsel "${prefix}"`);
  const { count } = await prisma.keyValueStore.deleteMany({ where: { key: { startsWith: prefix }, updatedAt: { lt: before } } });
  return count;
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
