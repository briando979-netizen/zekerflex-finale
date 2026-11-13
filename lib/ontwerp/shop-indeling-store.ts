import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { isStandaardShopIndeling, normalizeShopIndeling, type ShopIndeling } from "@/lib/ontwerp/shop-indeling";

// ---------------------------------------------------------------------------
// Opslag van de indeling van de webshop (lib/ontwerp/shop-indeling.ts). null = de standaard, ook bij een storing in de opslag:
// de webshop toont dan gewoon alle onderdelen in de oorspronkelijke volgorde.
// ---------------------------------------------------------------------------

const KEY = "ontwerp:shop-indeling";

export async function getShopIndeling(): Promise<ShopIndeling | null> {
  const raw = await kvGet<unknown>(KEY).catch(() => null);
  return raw ? normalizeShopIndeling(raw) : null;
}

/** Gelijk aan de standaard = de eigen versie weg (dan blijft de webshop exact zoals hij was). */
export async function setShopIndeling(raw: unknown): Promise<ShopIndeling | null> {
  const i = normalizeShopIndeling(raw);
  if (isStandaardShopIndeling(i)) {
    await kvDelete(KEY);
    return null;
  }
  await kvSet(KEY, i);
  return i;
}

export async function resetShopIndeling(): Promise<void> {
  await kvDelete(KEY);
}
