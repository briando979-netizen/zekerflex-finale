import { kvGet, kvSet } from "@/lib/storage/kv";
import { normalizeInstellingen, standaardInstellingen, type OsInstellingen } from "@/lib/os/instellingen";
import type { OsRol } from "@/lib/os/apps";

// ---------------------------------------------------------------------------
// De OS-voorkeuren per gebruiker (KV "os:<userId>"). Het voorvoegsel staat in
// ERASABLE_KV_PREFIXES (lib/privacy/user-kv.ts), dus het gaat mee in een
// AVG-export en wordt gewist als iemand zijn account verwijdert. Een storing
// in de opslag geeft gewoon de standaard: het bureaublad werkt altijd.
// ---------------------------------------------------------------------------

const sleutel = (userId: string) => `os:${userId}`;

export async function getOsInstellingen(userId: string, rol: OsRol): Promise<OsInstellingen> {
  const raw = await kvGet<unknown>(sleutel(userId)).catch(() => null);
  return raw ? normalizeInstellingen(raw, rol) : standaardInstellingen(rol);
}

export async function setOsInstellingen(userId: string, rol: OsRol, raw: unknown): Promise<OsInstellingen> {
  const i = normalizeInstellingen(raw, rol);
  await kvSet(sleutel(userId), i);
  return i;
}
