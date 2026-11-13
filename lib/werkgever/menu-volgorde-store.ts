import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { isStandaardMenuVolgorde, normalizeMenuVolgorde, type MenuVolgorde } from "@/lib/werkgever/menu-volgorde";

// ---------------------------------------------------------------------------
// Opslag van de volgorde van het werkgeversmenu (lib/werkgever/menu-volgorde.ts). null = de standaard, ook bij een storing
// in de opslag: het menu staat dan gewoon in de oorspronkelijke volgorde.
// ---------------------------------------------------------------------------

const KEY = "ontwerp:werkgever-menu";

export async function getMenuVolgorde(): Promise<MenuVolgorde | null> {
  const raw = await kvGet<unknown>(KEY).catch(() => null);
  return raw ? normalizeMenuVolgorde(raw) : null;
}

/** Gelijk aan de standaard = de eigen versie weg (dan blijft het menu exact zoals het was). */
export async function setMenuVolgorde(raw: unknown): Promise<MenuVolgorde | null> {
  const v = normalizeMenuVolgorde(raw);
  if (isStandaardMenuVolgorde(v)) {
    await kvDelete(KEY);
    return null;
  }
  await kvSet(KEY, v);
  return v;
}

export async function resetMenuVolgorde(): Promise<void> {
  await kvDelete(KEY);
}
