import { kvGet, kvGetMany, kvSet } from "@/lib/storage/kv";
import {
  EMMER_MAX,
  bedrijfSleutel,
  emmerSleutel,
  emmerWoord,
  emmersVoorNaam,
  isAnders,
  isKvkNummer,
  leesBedrijf,
  naarEmmerItem,
  plaatsSleutel,
  rangschik,
  voegSamen,
  voegToe,
} from "@/lib/kvk/normaliseer";
import { profielNaarBedrijf, type ProfielVoorIndex } from "@/lib/kvk/bronnen";
import type { EmmerItem, KvkBedrijf } from "@/lib/kvk/types";

// ---------------------------------------------------------------------------
// De opslag van de eigen bedrijvenindex, in de KV-tabel (geen schemawijziging):
//
//   kvk-bedrijf:<8 cijfers>   het hele record van één bedrijf
//   kvk-index:n:<3 letters>   emmer: compacte items {k, n, p} van bedrijven met
//                             een naamwoord dat zo begint (max EMMER_MAX)
//   kvk-index:p:<plaats>      emmer per plaats (max EMMER_MAX)
//
// Een zoekopdracht leest dus één naam-emmer, hooguit één plaats-emmer per
// woord, en de records van de beste acht — nooit alle gegevens. Een emmer is
// begrensd: loopt hij vol, dan valt het oudste item eruit. Schrijven is
// lezen-aanpassen-schrijven zonder slot; twee gelijktijdige schrijvers kunnen
// één item kwijtraken. Dat is bewust goed genoeg: het is een geheugen dat zich
// bij het volgende antwoord van de bron vanzelf herstelt.
//
// Alleen openbare bedrijfsgegevens, geen persoon: geen sleutel per gebruiker,
// dus niets voor ERASABLE_KV_PREFIXES.
// ---------------------------------------------------------------------------

type Emmer = EmmerItem[];

function leesEmmer(raw: unknown): Emmer {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (i): i is EmmerItem =>
      !!i && typeof i === "object" && typeof (i as EmmerItem).k === "string" && typeof (i as EmmerItem).n === "string" && typeof (i as EmmerItem).p === "string",
  );
}

/** Onthoud bedrijven: records bijwerken waar iets veranderde en elke emmer één keer schrijven. */
export async function onthoudBedrijven(bedrijven: KvkBedrijf[]): Promise<number> {
  const uniek = new Map<string, KvkBedrijf>();
  for (const b of bedrijven) {
    const schoon = leesBedrijf(b);
    if (schoon) uniek.set(schoon.kvk, voegSamen(uniek.get(schoon.kvk) ?? null, schoon));
  }
  if (uniek.size === 0) return 0;

  const bestaand = await kvGetMany<unknown>([...uniek.keys()].map(bedrijfSleutel));
  const teSchrijven: KvkBedrijf[] = [];
  for (const nieuw of uniek.values()) {
    const oud = leesBedrijf(bestaand.get(bedrijfSleutel(nieuw.kvk)));
    const samen = voegSamen(oud, nieuw);
    if (!oud || isAnders(oud, samen)) teSchrijven.push(samen);
  }
  if (teSchrijven.length === 0) return 0;

  // emmers die bij deze bedrijven horen: eerst allemaal lezen, dan per emmer één schrijfactie
  const perEmmer = new Map<string, KvkBedrijf[]>();
  for (const b of teSchrijven) {
    const sleutels = [...emmersVoorNaam(b.naam), ...(b.plaats ? [plaatsSleutel(b.plaats)] : [])];
    for (const s of sleutels) perEmmer.set(s, [...(perEmmer.get(s) ?? []), b]);
  }
  const emmers = await kvGetMany<unknown>([...perEmmer.keys()]);
  await Promise.all([
    ...teSchrijven.map((b) => kvSet(bedrijfSleutel(b.kvk), b)),
    ...[...perEmmer.entries()].map(([sleutel, lijst]) => {
      let emmer = leesEmmer(emmers.get(sleutel));
      for (const b of lijst) emmer = voegToe(emmer, naarEmmerItem(b), EMMER_MAX);
      return kvSet(sleutel, emmer);
    }),
  ]);
  return teSchrijven.length;
}

/** Zoek in de index op de woorden van een vraag. Leeg als er niets past. */
export async function zoekInIndex(vraagWoorden: string[], max = 8): Promise<KvkBedrijf[]> {
  const woord = emmerWoord(vraagWoorden);
  if (!woord) return [];
  const sleutels = [emmerSleutel(woord), ...vraagWoorden.filter((w) => w.length >= 3).map((w) => plaatsSleutel(w))];
  const emmers = await kvGetMany<unknown>([...new Set(sleutels)]);
  const kandidaten = new Map<string, EmmerItem>();
  for (const raw of emmers.values()) for (const item of leesEmmer(raw)) kandidaten.set(item.k, item);

  const beste = rangschik([...kandidaten.values()], vraagWoorden, max);
  if (beste.length === 0) return [];
  const records = await kvGetMany<unknown>(beste.map((i) => bedrijfSleutel(i.k)));
  return beste
    .map((i) => leesBedrijf(records.get(bedrijfSleutel(i.k))))
    .filter((b): b is KvkBedrijf => b !== null);
}

/** Eén bedrijf op zijn KVK-nummer. */
export async function bedrijfOpNummer(kvk: string): Promise<KvkBedrijf | null> {
  if (!isKvkNummer(kvk)) return null;
  return leesBedrijf(await kvGet<unknown>(bedrijfSleutel(kvk)));
}

/** Een volledig profiel dat we toch al ophalen (aanmelden, controle) ook in de index bewaren. Gooit nooit. */
export async function onthoudProfiel(profiel: ProfielVoorIndex): Promise<void> {
  try {
    const b = profielNaarBedrijf(profiel);
    if (b) await onthoudBedrijven([b]);
  } catch {
    /* de index is een geheugen, nooit een reden dat aanmelden mislukt */
  }
}
