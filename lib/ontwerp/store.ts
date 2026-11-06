import { randomUUID } from "node:crypto";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { getBranding, setBranding } from "@/lib/branding/settings";
import { STANDAARD_THEMA, normalizeThema, themaCss, type OntwerpStaat, type OntwerpVersie, type Thema } from "@/lib/ontwerp/thema";

// ---------------------------------------------------------------------------
// Opslag van de Site-ontwerper: een concept (waar de eigenaar aan werkt), de
// live versie (wat bezoekers zien) en de laatste 30 gepubliceerde versies om
// terug te zetten. Alles in de KeyValueStore; geen migratie nodig.
// Wie nog nooit heeft gepubliceerd, houdt de oude merkkleuren uit
// Huisstijl (branding:colors), zodat niets verandert bij de overstap.
// ---------------------------------------------------------------------------

const CONCEPT = "ontwerp:concept";
const LIVE = "ontwerp:live";
const GESCHIEDENIS = "ontwerp:geschiedenis";
const MAX_GESCHIEDENIS = 30;

export type { OntwerpStaat, OntwerpVersie };

interface Opgeslagen {
  thema: Thema;
  op: string;
  door: string;
}

export async function getLiveThema(): Promise<Thema> {
  const live = await kvGet<Opgeslagen>(LIVE).catch(() => null);
  if (live?.thema) return normalizeThema(live.thema);
  // nog nooit gepubliceerd: de merkkleuren van vroeger (Admin → Huisstijl)
  const b = await getBranding().catch(() => null);
  return b ? { ...STANDAARD_THEMA, primair: b.primaryHex.toUpperCase(), accent: b.mintHex.toUpperCase() } : STANDAARD_THEMA;
}

/** De CSS voor de live site (app/layout.tsx); null = de vaste stijl, niets extra's. */
export async function liveOntwerpCss(): Promise<string | null> {
  return themaCss(await getLiveThema());
}

export async function getOntwerpStaat(): Promise<OntwerpStaat> {
  const [concept, live, geschiedenis] = await Promise.all([
    kvGet<Opgeslagen>(CONCEPT).catch(() => null),
    kvGet<Opgeslagen>(LIVE).catch(() => null),
    kvGet<OntwerpVersie[]>(GESCHIEDENIS).catch(() => null),
  ]);
  const liveThema = live?.thema ? normalizeThema(live.thema) : await getLiveThema();
  return {
    concept: concept?.thema ? normalizeThema(concept.thema) : liveThema,
    conceptOp: concept?.op ?? null,
    live: liveThema,
    liveOp: live?.op ?? null,
    geschiedenis: (Array.isArray(geschiedenis) ? geschiedenis : []).map((v) => ({ ...v, thema: normalizeThema(v.thema) })),
  };
}

export async function saveConcept(thema: unknown, door: string): Promise<Thema> {
  const t = normalizeThema(thema);
  await kvSet(CONCEPT, { thema: t, op: new Date().toISOString(), door } satisfies Opgeslagen);
  return t;
}

/** Het concept gaat live; de vorige live versie blijft in de geschiedenis. */
export async function publiceer(door: string, notitie: string): Promise<OntwerpVersie> {
  const staat = await getOntwerpStaat();
  const op = new Date().toISOString();
  const versie: OntwerpVersie = { id: randomUUID(), thema: staat.concept, op, door, notitie: notitie.trim().slice(0, 200) };
  await kvSet(LIVE, { thema: staat.concept, op, door } satisfies Opgeslagen);
  await kvSet(GESCHIEDENIS, [versie, ...staat.geschiedenis].slice(0, MAX_GESCHIEDENIS));
  // wie de merkkleuren nog los leest (Admin → Huisstijl, de beheer-API) ziet dezelfde kleuren
  await setBranding({ primaryHex: staat.concept.primair, mintHex: staat.concept.accent }).catch(() => undefined);
  return versie;
}

/** Een eerdere versie terug in het concept; publiceren blijft een eigen stap. */
export async function zetTerug(id: string, door: string): Promise<Thema | null> {
  const { geschiedenis } = await getOntwerpStaat();
  const versie = geschiedenis.find((v) => v.id === id);
  if (!versie) return null;
  return saveConcept(versie.thema, door);
}
