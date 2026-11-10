import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Adres, straat of plaats → coördinaten via de PDOK Locatieserver: de
// zoekdienst van de Nederlandse overheid. Openbaar, gratis, geen sleutel en
// Nederlandse gegevens — hier hoeft dus niets van Google aan te pas te komen
// (zie lib/gratis/diensten.ts, post "geocoderen").
//
// Twee broertjes blijven staan, met een andere afspraak:
//   - lib/integrations/pdok.ts  postcode + huisnummer bij het inschrijven, met
//     het midden van Nederland als terugval (dat pad mag nooit hard mislukken).
//   - lib/kaart/geo.ts          het zoekvak van de ZekerFlex Kaart (meerdere
//     resultaten, labels voor de kaart).
// Dit bestand is de algemene lezer voor de serverkant: vrije tekst erin, een
// punt of null eruit, met een klein geheugen zodat dezelfde klus of hetzelfde
// bedrijf niet twee keer opgevraagd wordt.
// ---------------------------------------------------------------------------

const BASIS = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const HOST = new URL(BASIS).host;
/** Alleen soorten waar een werkplek op kan liggen. */
const SOORTEN = "type:(adres OR weg OR woonplaats)";
/** Alleen adressen: die hebben altijd een postcode (thuisbasis van een werker). */
const ALLEEN_ADRESSEN = "type:adres";
const BASIS_OMGEKEERD = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse";
/** Een coördinaat van een telefoon is op tientallen meters nauwkeurig; verder dan dit is geen "dit adres". */
const OMGEKEERD_STRAAL_M = 250;
const VELDEN = "weergavenaam,type,centroide_ll,postcode,woonplaatsnaam,straatnaam";
const TIJDSLIMIET_MS = 4_000;
/** Een gevonden punt verschuift niet meer; een dag bewaren is ruim genoeg. */
const BEWAAR_MS = 24 * 60 * 60_000;
/** Niets gevonden korter bewaren: een typefout kan verbeterd worden. */
const BEWAAR_LEEG_MS = 10 * 60_000;
const MAX_REGELS = 500;

export interface PdokPlek {
  /** Zoals PDOK het schrijft, bijv. "Dam 1, 1012JS Amsterdam". */
  naam: string;
  /** adres, weg of woonplaats. */
  soort: string;
  lat: number;
  lon: number;
  postcode: string | null;
  plaats: string | null;
  straat: string | null;
}

// Gedeeld via globalThis: Next bundelt elke route apart, dus een gewone
// module-variabele zou per bundel opnieuw bestaan (zie AGENTS.md).
const g = globalThis as unknown as {
  __zfPdokGeheugen?: Map<string, { tot: number; plekken: PdokPlek[] }>;
};
const geheugen = (g.__zfPdokGeheugen ??= new Map());

/** "POINT(5.12100 52.09000)" → lengte- en breedtegraad. */
function leesPunt(wkt: unknown): { lon: number; lat: number } | null {
  if (typeof wkt !== "string") return null;
  const m = /POINT\(([-\d.]+)\s+([-\d.]+)\)/.exec(wkt);
  if (!m) return null;
  const lon = Number(m[1] ?? "");
  const lat = Number(m[2] ?? "");
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lon, lat };
}

const tekst = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Het antwoord van de Locatieserver → nette plekken. Onbruikbare regels vallen weg. */
export function leesPdokPlekken(data: unknown): PdokPlek[] {
  const docs = (data as { response?: { docs?: unknown[] } } | null)?.response?.docs;
  if (!Array.isArray(docs)) return [];
  const uit: PdokPlek[] = [];
  for (const d of docs) {
    const r = d as Record<string, unknown>;
    const punt = leesPunt(r.centroide_ll);
    const naam = tekst(r.weergavenaam);
    if (!punt || !naam) continue;
    uit.push({
      naam,
      soort: tekst(r.type) ?? "onbekend",
      lat: punt.lat,
      lon: punt.lon,
      postcode: tekst(r.postcode),
      plaats: tekst(r.woonplaatsnaam),
      straat: tekst(r.straatnaam),
    });
  }
  return uit;
}

function uitGeheugen(sleutel: string): PdokPlek[] | null {
  const regel = geheugen.get(sleutel);
  if (!regel) return null;
  if (regel.tot < Date.now()) {
    geheugen.delete(sleutel);
    return null;
  }
  return regel.plekken;
}

function inGeheugen(sleutel: string, plekken: PdokPlek[]): void {
  if (geheugen.size >= MAX_REGELS) {
    // Map houdt de volgorde van toevoegen: de oudste regel gaat eruit.
    const oudste = geheugen.keys().next();
    if (!oudste.done) geheugen.delete(oudste.value);
  }
  geheugen.set(sleutel, {
    tot: Date.now() + (plekken.length ? BEWAAR_MS : BEWAAR_LEEG_MS),
    plekken,
  });
}

/** Alles weggooien wat we onthouden hebben (beheer en tests). */
export function wisPdokGeheugen(): void {
  geheugen.clear();
}

/**
 * Zoek op vrije tekst ("Dam 1 Amsterdam", "Utrecht", "1012JS 1") en geef de
 * beste treffers terug. Niets gevonden, een storing of een time-out geeft een
 * lege lijst — dit is nooit een harde fout, de aanroeper beslist zelf.
 */
export async function zoekPlekken(zoekterm: string, aantal = 5, opties: { alleenAdressen?: boolean } = {}): Promise<PdokPlek[]> {
  const q = zoekterm.trim().replace(/\s+/g, " ");
  if (q.length < 2) return [];
  const rijen = Math.min(Math.max(1, Math.trunc(aantal)), 10);
  const adressen = opties.alleenAdressen === true;
  // Zonder opties blijft de sleutel zoals hij was (bestaande tests en aanroepers).
  const sleutel = `${adressen ? "a|" : ""}${rijen}|${q.toLowerCase()}`;

  const bekend = uitGeheugen(sleutel);
  if (bekend) return bekend;

  let plekken: PdokPlek[] = [];
  try {
    const url = new URL(BASIS);
    url.searchParams.set("q", q);
    url.searchParams.set("fq", adressen ? ALLEEN_ADRESSEN : SOORTEN);
    url.searchParams.set("rows", String(rijen));
    url.searchParams.set("fl", VELDEN);

    const res = await fetch(url, { signal: AbortSignal.timeout(TIJDSLIMIET_MS) });
    if (!res.ok) {
      // Nooit de zoekterm loggen: dat is een adres, dus een persoonsgegeven.
      logger.warn("pdok locatieserver gaf een fout", { host: HOST, status: res.status });
      return [];
    }
    plekken = leesPdokPlekken(await res.json());
  } catch (err) {
    logger.warn("pdok locatieserver niet bereikbaar", {
      host: HOST,
      error: (err as Error).message,
    });
    return [];
  }

  inGeheugen(sleutel, plekken);
  return plekken;
}

/**
 * Eén punt voor een adres of plaats, of null als PDOK niets weet. Gebruik dit
 * waar een coördinaat nodig is (klus op de kaart, reistijd schatten); valt er
 * niets te vinden, laat dan het veld leeg in plaats van een gok te bewaren.
 */
export async function zoekCoordinaat(zoekterm: string): Promise<PdokPlek | null> {
  const plekken = await zoekPlekken(zoekterm, 1);
  return plekken[0] ?? null;
}

/**
 * Het dichtstbijzijnde adres bij een coordinaat (de knop "Gebruik mijn huidige
 * locatie"), of null als er binnen een paar honderd meter geen adres ligt
 * (buiten Nederland, in een veld) of PDOK niet antwoordt. De coordinaat wordt
 * op vier decimalen (ongeveer 10 m) afgerond voor het geheugen en nooit gelogd:
 * dat is een plek waar iemand staat, dus een persoonsgegeven.
 */
export async function adresBijCoordinaat(lat: number, lon: number): Promise<PdokPlek | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const sleutel = `o|${lat.toFixed(4)}|${lon.toFixed(4)}`;
  const bekend = uitGeheugen(sleutel);
  if (bekend) return bekend[0] ?? null;

  let plekken: PdokPlek[] = [];
  try {
    const url = new URL(BASIS_OMGEKEERD);
    url.searchParams.set("lat", lat.toFixed(5));
    url.searchParams.set("lon", lon.toFixed(5));
    url.searchParams.set("type", "adres");
    url.searchParams.set("rows", "1");
    url.searchParams.set("distance", String(OMGEKEERD_STRAAL_M));
    url.searchParams.set("fl", VELDEN);

    const res = await fetch(url, { signal: AbortSignal.timeout(TIJDSLIMIET_MS) });
    if (!res.ok) {
      logger.warn("pdok omgekeerd zoeken gaf een fout", { host: HOST, status: res.status });
      return null;
    }
    plekken = leesPdokPlekken(await res.json());
  } catch (err) {
    logger.warn("pdok omgekeerd zoeken niet bereikbaar", { host: HOST, error: (err as Error).message });
    return null;
  }

  inGeheugen(sleutel, plekken);
  return plekken[0] ?? null;
}
