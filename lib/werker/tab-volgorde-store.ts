import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { isStandaardTabVolgorde, normalizeTabVolgorde, type TabSleutel } from "@/lib/werker/tab-volgorde";

// ---------------------------------------------------------------------------
// Opslag van de volgorde van de balk van de werker-app (lib/werker/tab-volgorde.ts). null = de standaard, ook bij een
// storing in de opslag: de balk staat dan gewoon in de oorspronkelijke volgorde.
// ---------------------------------------------------------------------------

const KEY = "ontwerp:werker-tabs";

export async function getTabVolgorde(): Promise<TabSleutel[] | null> {
  const raw = await kvGet<unknown>(KEY).catch(() => null);
  return raw ? normalizeTabVolgorde(raw) : null;
}

/** Gelijk aan de standaard = de eigen versie weg (dan blijft de balk exact zoals hij was). */
export async function setTabVolgorde(raw: unknown): Promise<TabSleutel[] | null> {
  const v = normalizeTabVolgorde(raw);
  if (isStandaardTabVolgorde(v)) {
    await kvDelete(KEY);
    return null;
  }
  await kvSet(KEY, v);
  return v;
}

export async function resetTabVolgorde(): Promise<void> {
  await kvDelete(KEY);
}
