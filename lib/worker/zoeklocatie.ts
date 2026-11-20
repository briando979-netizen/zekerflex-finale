import { kvGet, kvSet } from "@/lib/storage/kv";
import { maakZoeklocatie, type Zoeklocatie } from "@/lib/worker/zoeklocatie-kern";

// De zoeklocatie van een werker (startscherm "Waar wil je klussen doen?"), per gebruiker in de KV. Het
// sleutelvoorvoegsel staat in ERASABLE_KV_PREFIXES (lib/privacy/user-kv.ts): mee in export en wissen.

const sleutel = (userId: string) => `werker-zoeklocatie:${userId}`;

export async function getZoeklocatie(userId: string): Promise<Zoeklocatie | null> {
  const ruw = await kvGet<unknown>(sleutel(userId));
  return maakZoeklocatie(ruw);
}

/** Bewaart de plaats; onbruikbare invoer wordt nooit bewaard en geeft null. */
export async function setZoeklocatie(userId: string, invoer: unknown): Promise<Zoeklocatie | null> {
  const plek = maakZoeklocatie(invoer);
  if (!plek) return null;
  await kvSet(sleutel(userId), { ...plek, at: new Date().toISOString() });
  return plek;
}
