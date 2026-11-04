import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { STANDAARD_VOETTEKST, normalizeVoettekst, type Voettekst } from "@/lib/ontwerp/menu";
import { isStandaardHoofdmenu, normalizeHoofdmenu, type Hoofdmenu } from "@/lib/ontwerp/hoofdmenu";

// ---------------------------------------------------------------------------
// Opslag van de voettekst en het hoofdmenu uit de Site-ontwerper. Geen eigen versie (of de
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

// Het hoofdmenu (bovenbalk). null = het standaardmenu, ook bij een storing.
const HOOFDMENU_KEY = "ontwerp:hoofdmenu";

export async function getHoofdmenu(): Promise<Hoofdmenu | null> {
  const raw = await kvGet<unknown>(HOOFDMENU_KEY).catch(() => null);
  return raw ? normalizeHoofdmenu(raw) : null;
}

/** Gelijk aan de standaard = de eigen versie weg (dan blijft de site exact zoals hij was). */
export async function setHoofdmenu(raw: unknown): Promise<Hoofdmenu | null> {
  const m = normalizeHoofdmenu(raw);
  if (isStandaardHoofdmenu(m)) {
    await kvDelete(HOOFDMENU_KEY);
    return null;
  }
  await kvSet(HOOFDMENU_KEY, m);
  return m;
}

export async function resetHoofdmenu(): Promise<void> {
  await kvDelete(HOOFDMENU_KEY);
}
