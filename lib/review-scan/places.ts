import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  bedrijvenBron,
  leesOsmPlaatsId,
  osmBijHost,
  osmPlaatsOpvragen,
  osmUrenNaarRegels,
  osmZoekBedrijven,
  type BedrijvenBron,
  type OsmPlaats,
} from "@/lib/integrations/osm-plaatsen";
import type { Concurrent, Profiel, ScanReview } from "@/lib/review-scan/model";

// ---------------------------------------------------------------------------
// Een bedrijf opzoeken voor de review-scan: zoeken, het profiel ophalen en
// vergelijkbare bedrijven in de buurt. Twee bronnen, in deze volgorde:
//
//   1. onze eigen bron, OpenStreetMap (lib/integrations/osm-plaatsen.ts) —
//      gratis en zonder sleutel. Hij gaat vóór zodra "alles gratis" aanstaat of
//      er geen Google-sleutel is, en dient anders als terugval.
//   2. Google Places (NEW) met GOOGLE_MAPS_API_KEY, dezelfde sleutel als de
//      sales-leads. Per opvraging afgerekend.
//
// Eerlijk over het verschil: **sterren en aantallen reviews bestaan alleen bij
// Google**. Komt het antwoord van onze eigen bron, dan blijven `rating` null en
// `aantal` 0, komen er geen reviews mee en zegt de scan dat ook zo
// (GEEN_BEOORDELINGEN). We verzinnen nooit een cijfer.
// Reviewers bewaren we niet bij naam: alleen sterren, tekst en datum.
// ---------------------------------------------------------------------------

const BASIS = "https://places.googleapis.com/v1";
const DETAIL_VELDEN = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "location",
  "rating",
  "userRatingCount",
  "reviews",
  "googleMapsUri",
  "websiteUri",
  "nationalPhoneNumber",
  "regularOpeningHours",
  "photos",
  "businessStatus",
  "primaryType",
  "primaryTypeDisplayName",
].join(",");

export class ScanFout extends Error {
  constructor(
    message: string,
    readonly code: "GEEN_SLEUTEL" | "NIET_GEVONDEN" | "GOOGLE" | "ONGELDIG" | "GEEN_BEOORDELINGEN",
  ) {
    super(message);
  }
}

export const placesAan = () => Boolean(env.GOOGLE_MAPS_API_KEY);

/**
 * Eerlijk antwoord als we het bedrijf wél kennen, maar niet zijn beoordelingen:
 * die staan alleen bij Google. Liever dit dan een verzonnen getal.
 */
export function geenBeoordelingenUitleg(naam: string | null): string {
  const wie = naam ? `${naam} staat wel op OpenStreetMap, onze eigen kaartbron` : "Dit bedrijf staat wel op OpenStreetMap, onze eigen kaartbron";
  return `${wie}. Maar sterren en reviews staan alleen bij Google: geen beoordelingen gevonden via onze eigen bron. We verzinnen geen cijfer, dus we kunnen nu geen reviewscore geven. Probeer het later nog eens.`;
}

export interface Kandidaat {
  placeId: string;
  naam: string;
  adres: string;
  website: string | null;
  /** alleen Google kent sterren; bij onze eigen bron blijft dit null */
  rating: number | null;
  /** alleen Google kent het aantal reviews; bij onze eigen bron blijft dit 0 */
  aantal: number;
  bron: BedrijvenBron;
}

export interface PlaatsDetails extends Kandidaat {
  plaats: string | null;
  mapsUrl: string | null;
  categorie: string | null;
  type: string | null;
  locatie: { lat: number; lng: number } | null;
  profiel: Profiel;
  reviews: ScanReview[];
}

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const tekstVan = (v: unknown) => str(obj(v).text);

async function google(pad: string, init: { method: "GET" | "POST"; velden: string; body?: Json }): Promise<Json> {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new ScanFout("De koppeling met Google staat nog niet aan.", "GEEN_SLEUTEL");
  const res = await fetch(`${BASIS}${pad}`, {
    method: init.method,
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": init.velden },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(12_000),
  }).catch((err: Error) => {
    throw new ScanFout(`Google gaf geen antwoord (${err.name === "TimeoutError" ? "te traag" : "geen verbinding"}). Probeer het zo opnieuw.`, "GOOGLE");
  });
  if (!res.ok) {
    // status en Googles eigen melding loggen; de sleutel staat in een header en komt nooit in de log
    const melding = str(obj(obj(await res.json().catch(() => ({}))).error).message)?.slice(0, 200) ?? null;
    logger.warn("review-scan places fout", { pad: pad.split("?")[0]?.replace(/places\/[^/:]+/, "places/…"), status: res.status, melding });
    if (res.status === 404 || (res.status === 400 && /place ?id|not found|invalid.*id/i.test(melding ?? ""))) throw new ScanFout("Dit bedrijf vonden we niet op Google.", "NIET_GEVONDEN");
    throw new ScanFout("Google is even niet bereikbaar. Probeer het zo opnieuw.", "GOOGLE");
  }
  return obj(await res.json().catch(() => ({})));
}

function kandidaatVan(p: Json): Kandidaat | null {
  const placeId = str(p.id);
  const naam = tekstVan(p.displayName);
  if (!placeId || !naam) return null;
  return { placeId, naam, adres: str(p.formattedAddress) ?? "", website: str(p.websiteUri), rating: num(p.rating), aantal: num(p.userRatingCount) ?? 0, bron: "google" };
}

/** Een bedrijf van onze eigen bron als kandidaat: zonder sterren, want die kent OSM niet. */
function kandidaatVanOsm(p: OsmPlaats): Kandidaat {
  return { placeId: p.id, naam: p.naam, adres: p.adres, website: p.website, rating: null, aantal: 0, bron: "osm" };
}

/** Bedrijven die bij een zoekterm passen (hooguit 5), optioneel rond een punt op de kaart. */
export async function zoekBedrijven(zoekterm: string, rond?: { lat: number; lng: number } | null): Promise<Kandidaat[]> {
  if ((await bedrijvenBron()) === "osm") return zoekBijOsm(zoekterm, rond);
  const viaGoogle = await viaGoogleZoeken(zoekterm, rond).catch((err: unknown) => {
    // Google weg of leeg? Dan onze eigen bron, zodat het zoeken blijft werken
    if (err instanceof ScanFout && err.code === "GOOGLE") {
      logger.info("bedrijven zoeken via onze eigen bron: google gaf niets");
      return null;
    }
    throw err;
  });
  if (viaGoogle && viaGoogle.length > 0) return viaGoogle;
  const eigen = await zoekBijOsm(zoekterm, rond);
  return eigen.length > 0 ? eigen : (viaGoogle ?? []);
}

async function zoekBijOsm(zoekterm: string, rond?: { lat: number; lng: number } | null): Promise<Kandidaat[]> {
  const lijst = await osmZoekBedrijven(zoekterm, { aantal: 5, ...(rond ? { rond } : {}) });
  return lijst.map(kandidaatVanOsm);
}

async function viaGoogleZoeken(zoekterm: string, rond?: { lat: number; lng: number } | null): Promise<Kandidaat[]> {
  const data = await google("/places:searchText", {
    method: "POST",
    velden: "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.rating,places.userRatingCount",
    body: {
      textQuery: zoekterm,
      languageCode: "nl",
      regionCode: "NL",
      maxResultCount: 5,
      ...(rond ? { locationBias: { circle: { center: { latitude: rond.lat, longitude: rond.lng }, radius: 2000 } } } : {}),
    },
  });
  const lijst = Array.isArray(data.places) ? data.places : [];
  return lijst.map((p) => kandidaatVan(obj(p))).filter((k): k is Kandidaat => k !== null);
}

/**
 * Het profiel van één bedrijf. Bij Google horen de reviews erbij (hooguit 5);
 * bij onze eigen bron blijft het profiel zonder beoordelingen — `bron` zegt
 * welke van de twee het is, zodat de scan daar eerlijk over kan zijn.
 */
export async function bedrijfDetails(placeId: string): Promise<PlaatsDetails> {
  if (leesOsmPlaatsId(placeId)) return osmDetails(placeId);
  if ((await bedrijvenBron()) === "osm") throw new ScanFout(geenBeoordelingenUitleg(null), "GEEN_BEOORDELINGEN");
  const p = await google(`/places/${encodeURIComponent(placeId)}?languageCode=nl&regionCode=NL`, { method: "GET", velden: DETAIL_VELDEN });
  const basis = kandidaatVan(p);
  if (!basis) throw new ScanFout("Dit bedrijf vonden we niet op Google.", "NIET_GEVONDEN");
  const onderdelen = Array.isArray(p.addressComponents) ? p.addressComponents.map(obj) : [];
  const plaats = onderdelen.find((c) => Array.isArray(c.types) && c.types.includes("locality"));
  const loc = obj(p.location);
  const lat = num(loc.latitude);
  const lng = num(loc.longitude);
  const status = str(p.businessStatus);
  const reviews: ScanReview[] = (Array.isArray(p.reviews) ? p.reviews : [])
    .map(obj)
    .map((r) => ({
      rating: Math.round(num(r.rating) ?? 0),
      tekst: (tekstVan(r.text) ?? tekstVan(r.originalText) ?? "").slice(0, 2000),
      geplaatst: str(r.publishTime),
      wanneer: str(r.relativePublishTimeDescription),
    }))
    .filter((r) => r.rating >= 1 && r.rating <= 5);
  return {
    ...basis,
    plaats: plaats ? str(plaats.longText) : null,
    mapsUrl: str(p.googleMapsUri),
    categorie: tekstVan(p.primaryTypeDisplayName),
    type: str(p.primaryType),
    locatie: lat !== null && lng !== null ? { lat, lng } : null,
    profiel: {
      telefoon: Boolean(str(p.nationalPhoneNumber)),
      website: Boolean(basis.website),
      openingstijden: Boolean(p.regularOpeningHours),
      fotos: Array.isArray(p.photos) ? p.photos.length : 0,
      status: status === "OPERATIONAL" || status === "CLOSED_TEMPORARILY" || status === "CLOSED_PERMANENTLY" ? status : null,
    },
    reviews,
  };
}

/**
 * Hetzelfde profiel, maar van OpenStreetMap: naam, adres, plaats, coördinaten
 * en (als iemand ze invulde) website, telefoon en openingstijden. Geen sterren,
 * geen aantal reviews, geen foto's — die staan niet in OSM. Daarom `rating:
 * null`, `aantal: 0` en een lege reviewlijst: nooit een verzonnen getal.
 */
async function osmDetails(plaatsId: string): Promise<PlaatsDetails> {
  const p = await osmPlaatsOpvragen(plaatsId);
  if (!p) throw new ScanFout("Dit bedrijf vonden we niet op onze eigen kaartbron.", "NIET_GEVONDEN");
  return {
    ...kandidaatVanOsm(p),
    plaats: p.plaats,
    mapsUrl: null, // het scherm zet hier "Bekijk op Google" bij; dat zou niet kloppen
    categorie: p.soort,
    type: p.soort,
    locatie: p.locatie,
    profiel: {
      telefoon: Boolean(p.telefoon),
      website: Boolean(p.website),
      openingstijden: Boolean(p.openingstijden),
      fotos: 0, // OSM heeft geen bedrijfsfoto's; dit is "onbekend", geen oordeel
      status: null,
    },
    reviews: [],
  };
}

export interface GoogleVoorSite {
  rating: number | null;
  aantal: number;
  mapsUrl: string | null;
  /** "maandag: 09:00–17:00", zoals Google ze geeft */
  uren: string[];
  telefoon: string | null;
}

const kaal = (host: string) => host.toLowerCase().replace(/^www\./, "");

/**
 * Het profiel van het bedrijf achter een website, voor de nieuwe site (lib/website-check/inlezen-site.ts):
 * score, aantal reviews, openingstijden en telefoon. Alleen als het profiel naar díe website wijst, zodat we
 * nooit de gegevens van een ander bedrijf met dezelfde naam overnemen. Lichte velden, geen reviews.
 *
 * Google eerst als zijn sleutel er is en "alles gratis" uit staat, anders (of als Google niets geeft) onze
 * eigen bron. Van OSM komen alleen openingstijden en telefoon: `rating` blijft dan null en `aantal` 0.
 */
export async function googleVoorWebsite(naam: string | null, plaats: string | null, host: string): Promise<GoogleVoorSite | null> {
  if (!naam) return null;
  if ((await bedrijvenBron()) === "google") {
    const viaGoogle = await viaGoogleVoorWebsite(naam, plaats, host).catch((err: Error) => {
      logger.info("profiel bij de website: google viel weg, we kijken bij onze eigen bron", { reden: err.message.slice(0, 120) });
      return null;
    });
    if (viaGoogle) return viaGoogle;
  }
  return viaOsmVoorWebsite(naam, plaats, host);
}

async function viaGoogleVoorWebsite(naam: string, plaats: string | null, host: string): Promise<GoogleVoorSite | null> {
  if (!placesAan()) return null;
  const k = await viaGoogleZoeken([naam, plaats].filter(Boolean).join(" "));
  const match = k.find((c) => {
    try {
      return c.website !== null && kaal(new URL(c.website).hostname) === kaal(host);
    } catch {
      return false;
    }
  });
  if (!match) return null;
  const p = await google(`/places/${encodeURIComponent(match.placeId)}?languageCode=nl&regionCode=NL`, {
    method: "GET",
    velden: "rating,userRatingCount,googleMapsUri,regularOpeningHours,nationalPhoneNumber",
  });
  const uren = obj(p.regularOpeningHours).weekdayDescriptions;
  return {
    rating: num(p.rating),
    aantal: num(p.userRatingCount) ?? 0,
    mapsUrl: str(p.googleMapsUri),
    uren: Array.isArray(uren) ? uren.filter((u): u is string => typeof u === "string").slice(0, 7) : [],
    telefoon: str(p.nationalPhoneNumber),
  };
}

/** Onze eigen bron bij een website: openingstijden en telefoon. Een score geeft hij niet, dus die blijft leeg. */
async function viaOsmVoorWebsite(naam: string, plaats: string | null, host: string): Promise<GoogleVoorSite | null> {
  const lijst = await osmZoekBedrijven([naam, plaats].filter(Boolean).join(" "), { aantal: 8 });
  const match = osmBijHost(lijst, host);
  if (!match) return null;
  return {
    rating: null, // OpenStreetMap kent geen sterren — nooit een getal verzinnen
    aantal: 0,
    mapsUrl: null,
    uren: osmUrenNaarRegels(match.openingstijden).slice(0, 7),
    telefoon: match.telefoon,
  };
}

/**
 * Vergelijkbare bedrijven binnen 3 km (zelfde soort), zonder het bedrijf zelf. Faalt stil: dan zonder vergelijking.
 * Komt het bedrijf van onze eigen bron, dan slaan we dit over: zonder sterren valt er niets te vergelijken en een
 * lijst met lege scores zegt niets.
 */
export async function concurrentenVan(d: PlaatsDetails): Promise<Concurrent[]> {
  if (d.bron === "osm" || !d.locatie) return [];
  const velden = "places.id,places.displayName,places.rating,places.userRatingCount,places.googleMapsUri";
  const cirkel = { circle: { center: { latitude: d.locatie.lat, longitude: d.locatie.lng }, radius: 3000 } };
  let lijst: unknown[] = [];
  try {
    if (d.type) {
      const data = await google("/places:searchNearby", {
        method: "POST",
        velden,
        body: { includedTypes: [d.type], maxResultCount: 10, rankPreference: "POPULARITY", languageCode: "nl", regionCode: "NL", locationRestriction: cirkel },
      });
      lijst = Array.isArray(data.places) ? data.places : [];
    }
  } catch {
    lijst = [];
  }
  if (lijst.length === 0 && d.categorie) {
    // niet elk soort mag in searchNearby; dan zoeken op de omschrijving in de plaats
    const data = await google("/places:searchText", {
      method: "POST",
      velden,
      body: { textQuery: `${d.categorie}${d.plaats ? ` ${d.plaats}` : ""}`, languageCode: "nl", regionCode: "NL", maxResultCount: 10, locationBias: cirkel },
    }).catch(() => ({}) as Json);
    lijst = Array.isArray(data.places) ? data.places : [];
  }
  return lijst
    .map(obj)
    .filter((p) => str(p.id) !== d.placeId)
    .map((p) => ({ naam: tekstVan(p.displayName) ?? "Onbekend", rating: num(p.rating), aantal: num(p.userRatingCount) ?? 0, mapsUrl: str(p.googleMapsUri) }))
    .filter((c) => c.aantal > 0)
    .slice(0, 8);
}
