import { kvAppend, kvGet, kvGetMany, kvSet } from "@/lib/storage/kv";
import { BRON_IDS, type BronId, type Meting } from "@/lib/bronnen/catalogus";

// ---------------------------------------------------------------------------
// Opslag van de bronnen in de KV (geen schema nodig):
//   bron:<id>:laatste   de laatste meting (ook als die mislukte)
//   bron:<id>:reeks     de geslaagde metingen, nieuwste achteraan (voor grafieken)
//   bron:<id>:fouten    aantal mislukkingen op rij (voor het alarm)
// ---------------------------------------------------------------------------

const kLaatste = (id: BronId) => `bron:${id}:laatste`;
const kReeks = (id: BronId) => `bron:${id}:reeks`;
const kFouten = (id: BronId) => `bron:${id}:fouten`;

export interface ReeksPunt {
  op: string;
  waarden: Record<string, number | string | null>;
}

export async function laatsteMeting(id: BronId): Promise<Meting | null> {
  return kvGet<Meting>(kLaatste(id));
}

export async function alleLaatste(): Promise<Record<BronId, Meting | null>> {
  const m = await kvGetMany<Meting>(BRON_IDS.map(kLaatste));
  return Object.fromEntries(BRON_IDS.map((id) => [id, m.get(kLaatste(id)) ?? null])) as Record<BronId, Meting | null>;
}

/** Een meting opslaan; een geslaagde ook in de reeks. Geeft het aantal mislukkingen op rij terug. */
export async function bewaarMeting(id: BronId, m: Meting): Promise<number> {
  await kvSet(kLaatste(id), m);
  if (m.ok) {
    await kvAppend<ReeksPunt>(kReeks(id), { op: m.op, waarden: m.waarden }, 400);
    await kvSet(kFouten(id), 0);
    return 0;
  }
  const n = ((await kvGet<number>(kFouten(id))) ?? 0) + 1;
  await kvSet(kFouten(id), n);
  return n;
}

export async function reeksVan(id: BronId, max = 60): Promise<ReeksPunt[]> {
  const r = (await kvGet<ReeksPunt[]>(kReeks(id))) ?? [];
  return r.slice(-max);
}

/** Schermafdrukken (PNG, base64) per pagina: alleen de laatste blijft staan. */
export const kBeeld = (pad: string) => `bron:schermen:beeld:${pad.replace(/[^a-z0-9]+/gi, "_") || "home"}`;
