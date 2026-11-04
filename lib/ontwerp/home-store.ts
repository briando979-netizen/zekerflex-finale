import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { isStandaardHomeIndeling, normalizeHomeIndeling, type HomeIndeling } from "@/lib/ontwerp/home";

// ---------------------------------------------------------------------------
// Opslag van de homepage-indeling uit de Site-ontwerper. Live = wat bezoekers
// zien; concept = wat de beheerder in het voorbeeld (/?concept=1) bekijkt.
// Geen eigen indeling (of de opslag is even weg) = de standaardvolgorde.
// ---------------------------------------------------------------------------

const LIVE = "ontwerp:home";
const CONCEPT = "ontwerp:home:concept";

async function lees(key: string): Promise<HomeIndeling | null> {
  const raw = await kvGet<unknown>(key).catch(() => null);
  return raw ? normalizeHomeIndeling(raw) : null;
}

export const getLiveHomeIndeling = () => lees(LIVE);

/** Het concept; zonder concept de live indeling. */
export async function getConceptHomeIndeling(): Promise<HomeIndeling | null> {
  return (await lees(CONCEPT)) ?? (await lees(LIVE));
}

export async function bewaarHomeConcept(raw: unknown): Promise<HomeIndeling> {
  const i = normalizeHomeIndeling(raw);
  await kvSet(CONCEPT, i);
  return i;
}

/** Het concept live zetten. Gelijk aan de standaard = de eigen indeling weg (de homepage blijft exact zoals hij was). */
export async function publiceerHome(raw: unknown): Promise<HomeIndeling | null> {
  const i = normalizeHomeIndeling(raw);
  await kvDelete(CONCEPT);
  if (isStandaardHomeIndeling(i)) {
    await kvDelete(LIVE);
    return null;
  }
  await kvSet(LIVE, i);
  return i;
}

export async function resetHome(): Promise<void> {
  await Promise.all([kvDelete(LIVE), kvDelete(CONCEPT)]);
}
