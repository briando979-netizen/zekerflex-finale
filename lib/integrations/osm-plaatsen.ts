import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { gebruikEigenVers, type KeuzeDienst } from "@/lib/gratis/keuzes";

// ---------------------------------------------------------------------------
// Bedrijven opzoeken via OpenStreetMap — onze eigen, gratis bron: geen sleutel,
// geen kosten per opvraging, geen bezoeker die naar een derde partij gaat.
// Twee ingangen bij de vaste, openbare diensten van OSM:
//   • Nominatim — zoeken op naam + plaats ("Bakkerij Jansen Utrecht") en één
//     bekend object opvragen (lookup);
//   • Overpass — zoeken per soort bedrijf in een gebied (bakkers binnen 3 km).
//
// Wat OSM wél geeft: naam, adres, plaats, coördinaten en — als iemand ze ooit
// invulde — website, telefoon en openingstijden.
// Wat OSM NIET geeft: sterren en aantallen reviews. Die bestaan alleen bij
// Google. Dit bestand heeft daarom geen enkel beoordelingsveld: er valt dus ook
// niets te verzinnen. Wie een score nodig heeft, hoort "niet gevonden via onze
// eigen bron" te melden, nooit een cijfer.
//
// De spelregels van OpenStreetMap volgen we netjes:
//   • een eerlijke User-Agent met de naam van de applicatie (geen privé-adres);
//   • Nominatim wil hooguit één aanvraag per seconde: aanvragen gaan daarom door
//     een wachtrij die via globalThis loopt (Next bundelt elke route apart, dus
//     een gewone module-variabele zou per bundel bestaan);
//   • een korte tijdslimiet en een uur cache in het geheugen, zodat we nooit
//     twee keer hetzelfde vragen.
// ---------------------------------------------------------------------------

const NOMINATIM_ZOEK = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_OPVRAGEN = "https://nominatim.openstreetmap.org/lookup";
const OVERPASS = "https://overpass-api.de/api/interpreter";

/** Zo stellen we ons voor bij OSM: de naam van de applicatie en een adres waar uitleg staat. */
const UA = "ZekerFlexBot/1.0 (+https://zekerflex.com/bot)";
const TIMEOUT_MS = 12_000;
const CACHE_MS = 60 * 60_000;
const CACHE_MAX = 500;

/** Nominatim: hooguit één aanvraag per seconde. Iets ruimer, zodat we er nooit net boven zitten. */
export const NOMINATIM_PAUZE_MS = 1_100;
/** Overpass is zwaarder werk; daar zijn we extra rustig. */
export const OVERPASS_PAUZE_MS = 2_000;

export type OsmSoort = "node" | "way" | "relation";
const OSM_SOORTEN: readonly OsmSoort[] = ["node", "way", "relation"];
const LETTER: Record<OsmSoort, string> = { node: "N", way: "W", relation: "R" };

export interface OsmPlaats {
  /** "osmplaats-node-002449097266": veilig in een URL en lang genoeg om als place-id door te geven */
  id: string;
  naam: string;
  /** "Oudegracht 1, 3511 AA Utrecht"; leeg als OSM geen adres bij het bedrijf heeft */
  adres: string;
  plaats: string | null;
  locatie: { lat: number; lng: number } | null;
  website: string | null;
  telefoon: string | null;
  /** het soort zoals OSM het noemt, bv. "restaurant" of "hairdresser" */
  soort: string | null;
  /** de tag waaronder dat soort staat, bv. "amenity", "shop" of "craft" */
  soortSleutel: string | null;
  /** openingstijden in OSM-notatie ("Mo-Fr 09:00-17:00"); null als onbekend */
  openingstijden: string | null;
  /** het object op openstreetmap.org, zodat iemand de gegevens zelf kan nakijken */
  kaartUrl: string;
}

// --- gedeelde staat: wachtrij per bron en een cache in het geheugen ----------------

interface Staat {
  rij: Map<string, Promise<void>>;
  cache: Map<string, { tot: number; waarde: unknown }>;
}
const g = globalThis as unknown as { __zfOsmPlaatsen?: Staat };
const staat: Staat = (g.__zfOsmPlaatsen ??= { rij: new Map(), cache: new Map() });

/**
 * Vriendelijke snelheidsrem: per bron begint hooguit één aanvraag per `pauzeMs`.
 * Wie te snel is wacht netjes op zijn beurt in plaats van een foutcode te krijgen.
 * Geëxporteerd omdat de test hiermee kan aantonen dat twee aanvragen achter
 * elkaar echt wachten.
 */
export async function inDeRij<T>(bron: string, pauzeMs: number, taak: () => Promise<T>): Promise<T> {
  const vorige = staat.rij.get(bron) ?? Promise.resolve();
  let geefVrij = (): void => {};
  const beurt = new Promise<void>((klaar) => {
    geefVrij = klaar;
  });
  staat.rij.set(bron, vorige.then(() => beurt));
  await vorige;
  const begin = Date.now();
  try {
    return await taak();
  } finally {
    // de volgende beurt begint pauzeMs ná het begin van deze, niet erna
    setTimeout(geefVrij, Math.max(0, pauzeMs - (Date.now() - begin)));
  }
}

function uitCache<T>(sleutel: string): T | null {
  const hit = staat.cache.get(sleutel);
  if (!hit) return null;
  if (hit.tot < Date.now()) {
    staat.cache.delete(sleutel);
    return null;
  }
  return hit.waarde as T;
}

function naarCache(sleutel: string, waarde: unknown): void {
  if (staat.cache.size >= CACHE_MAX) staat.cache.clear(); // simpel: laat het geheugen niet onbeperkt groeien
  staat.cache.set(sleutel, { tot: Date.now() + CACHE_MS, waarde });
}

/** Alleen voor tests: de cache en de wachtrij leegmaken. */
export function osmVergeetAlles(): void {
  staat.cache.clear();
  staat.rij.clear();
}

// --- welke bron gebruiken we? -----------------------------------------------------

export type BedrijvenBron = "google" | "osm";

/**
 * Welke bron voor dit doel? Dat staat per dienst ingesteld in Admin → Alles
 * gratis (lib/gratis/keuzes.ts): de buitendienst zoekt standaard in onze eigen
 * bron, de review-scan standaard bij Google — want de sterren staan alléén
 * daar. De standen komen uit KV en zijn 60 s gecachet, dus dit kost niets.
 */
export async function bedrijvenBron(doel: KeuzeDienst = "sales-bedrijven"): Promise<BedrijvenBron> {
  return (await gebruikEigenVers(doel, Boolean(env.GOOGLE_MAPS_API_KEY))) ? "osm" : "google";
}

// --- id's van OSM-objecten -------------------------------------------------------

const ID_VOORVOEGSEL = "osmplaats-";

/** "node" + 2449097266 → "osmplaats-node-002449097266" (altijd dezelfde lengte). */
export function osmPlaatsId(soort: OsmSoort, id: number | string): string {
  const cijfers = String(id).replace(/\D/g, "").slice(0, 12);
  return `${ID_VOORVOEGSEL}${soort}-${cijfers.padStart(12, "0")}`;
}

/** Terug naar het OSM-object, of null als dit geen id van ons is. */
export function leesOsmPlaatsId(waarde: string): { soort: OsmSoort; id: string } | null {
  const m = /^osmplaats-(node|way|relation)-(\d{1,12})$/.exec(waarde.trim());
  const soort = m?.[1];
  const cijfers = m?.[2];
  if (!soort || !cijfers) return null;
  const id = cijfers.replace(/^0+(?=\d)/, "");
  return id === "0" ? null : { soort: soort as OsmSoort, id };
}

export const isOsmPlaatsId = (waarde: string): boolean => leesOsmPlaatsId(waarde) !== null;

// --- kleine hulpjes --------------------------------------------------------------

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
function nummer(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Een webadres uit een OSM-tag: alleen http(s), zonder rommel erachter. */
function webAdres(ruw: string | null): string | null {
  if (!ruw) return null;
  const kaal = ruw.split(/[\s;,]/)[0] ?? "";
  if (!kaal) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(kaal) ? kaal : `https://${kaal}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Het eerste nummer uit een OSM-tag ("+31 30 123 4567; 06-12345678"), of null als het geen nummer is. */
function telefoonVan(ruw: string | null): string | null {
  if (!ruw) return null;
  const n = (ruw.split(";")[0] ?? "").replace(/[^\d+]/g, "");
  const cijfers = n.replace(/\D/g, "");
  if (cijfers.length < 9 || cijfers.length > 13) return null;
  return n.startsWith("+") || n.startsWith("0") ? n : null;
}

/** "Oudegracht 1, 3511 AA Utrecht" uit de losse adresdelen. */
function adresRegel(delen: { straat: string | null; nummer: string | null; postcode: string | null; plaats: string | null }): string {
  const links = [delen.straat, delen.nummer].filter(Boolean).join(" ");
  const rechts = [delen.postcode, delen.plaats].filter(Boolean).join(" ");
  return [links, rechts].filter(Boolean).join(", ");
}

// --- openingstijden van OSM-notatie naar Nederlandse regels -----------------------

const OSM_DAG: Record<string, number> = { mo: 0, tu: 1, we: 2, th: 3, fr: 4, sa: 5, su: 6 };
const DAG_NL = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
const TIJDVAK = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g;

function dagNummers(spec: string): number[] {
  const uit = new Set<number>();
  for (const stuk of spec.split(",")) {
    const reeks = /^([a-z]{2})(?:\s*-\s*([a-z]{2}))?$/.exec(stuk.trim().toLowerCase());
    const van = OSM_DAG[reeks?.[1] ?? ""];
    if (van === undefined) continue;
    const totNaam = reeks?.[2];
    const tot = totNaam ? OSM_DAG[totNaam] : van;
    if (tot === undefined) continue;
    // "Sa-Mo" loopt door het weekend heen
    for (let i = 0; i <= (tot - van + 7) % 7; i++) uit.add((van + i) % 7);
  }
  return [...uit];
}

/**
 * OSM schrijft openingstijden als "Mo-Fr 09:00-17:00; Sa 10:00-16:00". Hier maken
 * we er regels van zoals Google ze geeft ("maandag: 09:00 – 17:00"), zodat
 * lib/website-check/inlezen.ts ze net zo kan lezen. Wat we niet begrijpen laten
 * we weg: we gokken nooit een tijd.
 */
export function osmUrenNaarRegels(tag: string | null): string[] {
  if (!tag) return [];
  const perDag = new Map<number, string>();
  const zet = (dag: number, tijd: string) => {
    if (!perDag.has(dag)) perDag.set(dag, tijd);
  };
  for (const deel of tag.split(";")) {
    const regel = deel.trim();
    if (!regel) continue;
    if (/^24\/7$/i.test(regel)) {
      for (let d = 0; d < 7; d++) zet(d, "00:00 – 24:00");
      continue;
    }
    const m = /^((?:[A-Za-z]{2}(?:\s*-\s*[A-Za-z]{2})?)(?:\s*,\s*[A-Za-z]{2}(?:\s*-\s*[A-Za-z]{2})?)*)\s+(.*)$/.exec(regel);
    const dagen = dagNummers(m?.[1] ?? "");
    const rest = (m?.[2] ?? "").trim();
    if (dagen.length === 0 || !rest) continue;
    if (/^(off|closed)$/i.test(rest)) {
      for (const d of dagen) zet(d, "Gesloten");
      continue;
    }
    const vakken = [...rest.matchAll(TIJDVAK)]
      .filter((t) => Number(t[1]) <= 24 && Number(t[3]) <= 24)
      .map((t) => `${(t[1] ?? "").padStart(2, "0")}:${t[2] ?? "00"} – ${(t[3] ?? "").padStart(2, "0")}:${t[4] ?? "00"}`);
    if (vakken.length === 0) continue;
    const tijd = vakken.slice(0, 3).join(" en ");
    for (const d of dagen) zet(d, tijd);
  }
  return [...perDag.entries()].sort((a, b) => a[0] - b[0]).map(([d, tijd]) => `${DAG_NL[d] ?? ""}: ${tijd}`);
}

// --- antwoorden van OSM inlezen ---------------------------------------------------

function kaartUrl(soort: OsmSoort, id: string): string {
  return `https://www.openstreetmap.org/${soort}/${id}`;
}

/** Eén resultaat van Nominatim (search of lookup) naar onze vorm. */
function uitNominatim(r: Json): OsmPlaats | null {
  const soortRuw = str(r.osm_type)?.toLowerCase() ?? "";
  if (!OSM_SOORTEN.includes(soortRuw as OsmSoort)) return null;
  const soort = soortRuw as OsmSoort;
  const osmId = String(nummer(r.osm_id) ?? "").replace(/\D/g, "");
  const naam = str(r.name) ?? str(obj(r.namedetails).name);
  if (!osmId || !naam) return null; // zonder naam is het geen bedrijf maar een plek
  const extra = obj(r.extratags);
  const a = obj(r.address);
  const plaats = str(a.city) ?? str(a.town) ?? str(a.village) ?? str(a.municipality);
  const lat = nummer(r.lat);
  const lng = nummer(r.lon);
  return {
    id: osmPlaatsId(soort, osmId),
    naam,
    adres: adresRegel({ straat: str(a.road) ?? str(a.pedestrian), nummer: str(a.house_number), postcode: str(a.postcode), plaats }),
    plaats,
    locatie: lat !== null && lng !== null ? { lat, lng } : null,
    website: webAdres(str(extra.website) ?? str(extra["contact:website"]) ?? str(extra.url)),
    telefoon: telefoonVan(str(extra.phone) ?? str(extra["contact:phone"]) ?? str(extra["contact:mobile"])),
    soort: str(r.type),
    soortSleutel: str(r.category) ?? str(r.class),
    openingstijden: str(extra.opening_hours),
    kaartUrl: kaartUrl(soort, osmId),
  };
}

/** Eén element van Overpass naar onze vorm. */
function uitOverpass(e: Json): OsmPlaats | null {
  const soortRuw = str(e.type)?.toLowerCase() ?? "";
  if (!OSM_SOORTEN.includes(soortRuw as OsmSoort)) return null;
  const soort = soortRuw as OsmSoort;
  const osmId = String(nummer(e.id) ?? "").replace(/\D/g, "");
  const t = obj(e.tags);
  const naam = str(t.name);
  if (!osmId || !naam) return null;
  const midden = obj(e.center);
  const lat = nummer(e.lat) ?? nummer(midden.lat);
  const lng = nummer(e.lon) ?? nummer(midden.lon);
  const plaats = str(t["addr:city"]);
  const sleutel = ["amenity", "shop", "craft", "office", "leisure", "tourism", "healthcare"].find((k) => str(t[k]) !== null) ?? null;
  return {
    id: osmPlaatsId(soort, osmId),
    naam,
    adres: adresRegel({ straat: str(t["addr:street"]), nummer: str(t["addr:housenumber"]), postcode: str(t["addr:postcode"]), plaats }),
    plaats,
    locatie: lat !== null && lng !== null ? { lat, lng } : null,
    website: webAdres(str(t.website) ?? str(t["contact:website"])),
    telefoon: telefoonVan(str(t.phone) ?? str(t["contact:phone"])),
    soort: sleutel ? str(t[sleutel]) : null,
    soortSleutel: sleutel,
    openingstijden: str(t.opening_hours),
    kaartUrl: kaartUrl(soort, osmId),
  };
}

// --- de aanvragen zelf ------------------------------------------------------------

async function vraagJson(bron: "nominatim" | "overpass", url: string, pauzeMs: number, body?: string): Promise<unknown | null> {
  return inDeRij(bron, pauzeMs, async () => {
    try {
      const res = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "user-agent": UA,
          accept: "application/json",
          "accept-language": "nl",
          ...(body === undefined ? {} : { "content-type": "application/x-www-form-urlencoded" }),
        },
        ...(body === undefined ? {} : { body }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        // alleen de bron en de status in het log; nooit de hele zoekopdracht
        logger.warn("osm gaf geen bruikbaar antwoord", { bron, status: res.status });
        return null;
      }
      return (await res.json()) as unknown;
    } catch (err) {
      logger.warn("osm niet bereikbaar", { bron, fout: (err as Error).message.slice(0, 120) });
      return null;
    }
  });
}

function bewaar(lijst: OsmPlaats[]): OsmPlaats[] {
  for (const p of lijst) naarCache(`id:${p.id}`, p);
  return lijst;
}

export interface OsmZoekOpties {
  /** hooguit zoveel bedrijven terug (standaard 5, max 10) */
  aantal?: number;
  /** geef bedrijven rond dit punt voorrang */
  rond?: { lat: number; lng: number } | null;
}

/** Bedrijven in Nederland die bij een zoekterm passen ("Bakkerij Jansen Utrecht"). */
export async function osmZoekBedrijven(zoekterm: string, opties: OsmZoekOpties = {}): Promise<OsmPlaats[]> {
  const term = zoekterm.trim().replace(/\s+/g, " ").slice(0, 200);
  if (term.length < 3) return [];
  const url = new URL(NOMINATIM_ZOEK);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", term);
  url.searchParams.set("limit", String(Math.min(10, Math.max(1, opties.aantal ?? 5))));
  url.searchParams.set("countrycodes", "nl");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("accept-language", "nl");
  if (opties.rond) {
    // ongeveer 5 km om het punt heen: genoeg om de buurt voorrang te geven
    const d = 0.05;
    url.searchParams.set("viewbox", `${opties.rond.lng - d},${opties.rond.lat + d},${opties.rond.lng + d},${opties.rond.lat - d}`);
  }
  const sleutel = `zoek:${url.search}`;
  const bewaard = uitCache<OsmPlaats[]>(sleutel);
  if (bewaard) return bewaard;
  const data = await vraagJson("nominatim", url.toString(), NOMINATIM_PAUZE_MS);
  if (data === null) return []; // storing: niets bewaren, zodat de volgende poging het opnieuw probeert
  const lijst = (Array.isArray(data) ? data : []).map((r) => uitNominatim(obj(r))).filter((p): p is OsmPlaats => p !== null);
  naarCache(sleutel, lijst);
  return bewaar(lijst);
}

/** Eén bedrijf dat we eerder vonden, opnieuw opvragen op zijn OSM-id. */
export async function osmPlaatsOpvragen(plaatsId: string): Promise<OsmPlaats | null> {
  const osm = leesOsmPlaatsId(plaatsId);
  if (!osm) return null;
  const bewaard = uitCache<OsmPlaats>(`id:${plaatsId}`);
  if (bewaard) return bewaard;
  const url = new URL(NOMINATIM_OPVRAGEN);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("osm_ids", `${LETTER[osm.soort]}${osm.id}`);
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("accept-language", "nl");
  const data = await vraagJson("nominatim", url.toString(), NOMINATIM_PAUZE_MS);
  if (data === null) return null;
  const eerste = (Array.isArray(data) ? data : []).map((r) => uitNominatim(obj(r))).find((p): p is OsmPlaats => p !== null) ?? null;
  if (eerste) bewaar([eerste]);
  return eerste;
}

export interface OsmBuurtVraag {
  lat: number;
  lng: number;
  /** straal in meters (standaard 3000, max 20000) */
  radiusM?: number;
  /** het soort bedrijf zoals OSM het noemt, met de tag erbij */
  soort: { sleutel: string; soort: string };
  /** hooguit zoveel bedrijven terug (standaard 10, max 30) */
  aantal?: number;
}

/** Bedrijven van hetzelfde soort binnen een straal, via Overpass. */
export async function osmBedrijvenInBuurt(vraag: OsmBuurtVraag): Promise<OsmPlaats[]> {
  const sleutel = vraag.soort.sleutel.trim().toLowerCase();
  const soort = vraag.soort.soort.trim().toLowerCase();
  // alleen nette tagnamen; een vreemd teken zou de Overpass-opdracht kunnen oprekken
  if (!/^[a-z][a-z_:]{1,39}$/.test(sleutel) || !/^[a-z0-9][a-z0-9_:.-]{1,59}$/.test(soort)) return [];
  const lat = nummer(vraag.lat);
  const lng = nummer(vraag.lng);
  if (lat === null || lng === null) return [];
  const radius = Math.min(20_000, Math.max(100, Math.round(vraag.radiusM ?? 3_000)));
  const aantal = Math.min(30, Math.max(1, vraag.aantal ?? 10));
  const opdracht = `[out:json][timeout:20];nwr["${sleutel}"="${soort}"](around:${radius},${lat.toFixed(6)},${lng.toFixed(6)});out center tags ${aantal};`;
  const cacheSleutel = `buurt:${opdracht}`;
  const bewaard = uitCache<OsmPlaats[]>(cacheSleutel);
  if (bewaard) return bewaard;
  const data = await vraagJson("overpass", OVERPASS, OVERPASS_PAUZE_MS, `data=${encodeURIComponent(opdracht)}`);
  if (data === null) return [];
  const elementen = obj(data).elements;
  const lijst = (Array.isArray(elementen) ? elementen : []).map((e) => uitOverpass(obj(e))).filter((p): p is OsmPlaats => p !== null);
  naarCache(cacheSleutel, lijst);
  return bewaar(lijst);
}

const kaleHost = (host: string): string => host.toLowerCase().replace(/^www\./, "");

/** Het bedrijf uit een lijst dat bij deze website hoort, zodat we nooit een naamgenoot pakken. */
export function osmBijHost(lijst: readonly OsmPlaats[], host: string): OsmPlaats | null {
  const doel = kaleHost(host);
  return (
    lijst.find((p) => {
      if (!p.website) return false;
      try {
        return kaleHost(new URL(p.website).hostname) === doel;
      } catch {
        return false;
      }
    }) ?? null
  );
}
