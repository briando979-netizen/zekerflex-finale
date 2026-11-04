import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { STANDAARD_VOETTEKST, normalizeVoettekst, type Voettekst } from "@/lib/ontwerp/menu";

// ---------------------------------------------------------------------------
// Opslag van de voettekst uit de Site-ontwerper. Geen eigen versie (of de
// opslag is even weg) = de standaard, dus de site toont altijd een voettekst.
// ---------------------------------------------------------------------------

const KEY = "ontwerp:voettekst";

export async function getVoettekst(): Promise<{ voettekst: Voettekst; eigen: boolean }> {
  const raw = await kvGet<unknown>(KEY).catch(() => null);
  if (!raw) return { voettekst: STANDAARD_VOETTEKST, eigen: false };
  return { voettekst: normalizeVoettekst(raw), eigen: true };
}

export async function setVoettekst(raw: unknown): Promise<Voettekst> {
  const v = normalizeVoettekst(raw);
  await kvSet(KEY, v);
  return v;
}

/** Terug naar de standaard: de eigen versie weg. */
export async function resetVoettekst(): Promise<void> {
  await kvDelete(KEY);
}
