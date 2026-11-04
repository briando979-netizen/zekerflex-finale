import { kvGet, kvSet } from "@/lib/storage/kv";
import { LEGE_BALK, normalizeBalk, type Balk } from "@/lib/ontwerp/balk";

// Opslag van de aankondigingsbalk (KV ontwerp:balk). Geen balk of een storing = uit.

const KEY = "ontwerp:balk";

export async function getBalk(): Promise<Balk> {
  const raw = await kvGet<unknown>(KEY).catch(() => null);
  return raw ? normalizeBalk(raw) : LEGE_BALK;
}

export async function zetBalk(raw: unknown): Promise<Balk> {
  const b = normalizeBalk(raw);
  await kvSet(KEY, b);
  return b;
}
