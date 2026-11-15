import { randomUUID } from "node:crypto";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { MAX_BERICHTEN, MAX_GESPREKKEN, TITEL_MAX, type GesprekKop, type MijnAiBericht, type MijnAiGesprek } from "@/lib/mijn-ai/vorm";

// ---------------------------------------------------------------------------
// Opslag van Mijn AI (lib/mijn-ai/vorm.ts): per beheerder een lijst met koppen (mijn-ai-lijst:<userId>) en per gesprek
// één rij (mijn-ai:<userId>:<id>). Beide voorvoegsels staan in ERASABLE_KV_PREFIXES (inzage en wissen). Een gesprek
// houdt de laatste MAX_BERICHTEN berichten; de lijst de laatste MAX_GESPREKKEN gesprekken (het oudste valt eraf, met rij).
// ---------------------------------------------------------------------------

const lijstSleutel = (userId: string) => `mijn-ai-lijst:${userId}`;
const sleutel = (userId: string, id: string) => `mijn-ai:${userId}:${id}`;

export const isGesprekId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

export async function gesprekken(userId: string): Promise<GesprekKop[]> {
  const lijst = (await kvGet<GesprekKop[]>(lijstSleutel(userId))) ?? [];
  return [...lijst].sort((a, b) => (a.bijgewerkt < b.bijgewerkt ? 1 : -1));
}

async function zetKop(userId: string, kop: GesprekKop | null, weg?: string): Promise<void> {
  let lijst = ((await kvGet<GesprekKop[]>(lijstSleutel(userId))) ?? []).filter((k) => k.id !== (kop?.id ?? weg));
  if (kop) lijst.push(kop);
  if (lijst.length > MAX_GESPREKKEN) {
    lijst.sort((a, b) => (a.bijgewerkt < b.bijgewerkt ? 1 : -1));
    for (const oud of lijst.slice(MAX_GESPREKKEN)) await kvDelete(sleutel(userId, oud.id));
    lijst = lijst.slice(0, MAX_GESPREKKEN);
  }
  await kvSet(lijstSleutel(userId), lijst);
}

export async function nieuwGesprek(userId: string, titel = "Nieuw gesprek", nu = new Date()): Promise<MijnAiGesprek> {
  const g: MijnAiGesprek = { id: randomUUID(), titel, aangemaakt: nu.toISOString(), bijgewerkt: nu.toISOString(), berichten: [] };
  await kvSet(sleutel(userId, g.id), g);
  await zetKop(userId, { id: g.id, titel: g.titel, bijgewerkt: g.bijgewerkt });
  return g;
}

export async function leesGesprek(userId: string, id: string): Promise<MijnAiGesprek | null> {
  if (!isGesprekId(id)) return null;
  return kvGet<MijnAiGesprek>(sleutel(userId, id));
}

export async function hernoem(userId: string, id: string, titel: string, nu = new Date()): Promise<MijnAiGesprek | null> {
  const g = await leesGesprek(userId, id);
  if (!g) return null;
  const nieuw = { ...g, titel: titel.trim().slice(0, TITEL_MAX) || g.titel };
  await kvSet(sleutel(userId, id), nieuw);
  await zetKop(userId, { id, titel: nieuw.titel, bijgewerkt: nu.toISOString() });
  return nieuw;
}

export async function verwijder(userId: string, id: string): Promise<boolean> {
  const g = await leesGesprek(userId, id);
  if (!g) return false;
  await kvDelete(sleutel(userId, id));
  await zetKop(userId, null, id);
  return true;
}

/**
 * Berichten toevoegen (en eventueel eerst het laatste AI-antwoord weghalen, bij "opnieuw"). Het gesprek wordt opnieuw
 * gelezen vlak voor het schrijven, zodat een antwoord dat lang liep niets overschrijft wat intussen bijkwam.
 */
export async function voegToe(
  userId: string,
  id: string,
  berichten: MijnAiBericht[],
  opties: { titel?: string; laatsteAiWeg?: boolean } = {},
  nu = new Date(),
): Promise<MijnAiGesprek | null> {
  const g = await leesGesprek(userId, id);
  if (!g) return null;
  let lijst = g.berichten;
  if (opties.laatsteAiWeg && lijst.at(-1)?.rol === "ai") lijst = lijst.slice(0, -1);
  const nieuw: MijnAiGesprek = {
    ...g,
    titel: opties.titel ?? g.titel,
    bijgewerkt: nu.toISOString(),
    berichten: [...lijst, ...berichten].slice(-MAX_BERICHTEN),
  };
  await kvSet(sleutel(userId, id), nieuw);
  await zetKop(userId, { id, titel: nieuw.titel, bijgewerkt: nieuw.bijgewerkt });
  return nieuw;
}
