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
