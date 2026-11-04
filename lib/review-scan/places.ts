import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { Concurrent, Profiel, ScanReview } from "@/lib/review-scan/model";

// ---------------------------------------------------------------------------
// Google Places (NEW) voor de review-scan: een bedrijf zoeken, zijn profiel met
// score en reviews ophalen, en vergelijkbare bedrijven in de buurt. Dezelfde
// sleutel als de sales-leads (GOOGLE_MAPS_API_KEY, "Places API (New)").
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
    readonly code: "GEEN_SLEUTEL" | "NIET_GEVONDEN" | "GOOGLE" | "ONGELDIG",
  ) {
    super(message);
  }
}

export const placesAan = () => Boolean(env.GOOGLE_MAPS_API_KEY);

export interface Kandidaat {
  placeId: string;
  naam: string;
  adres: string;
  website: string | null;
  rating: number | null;
  aantal: number;
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
  return { placeId, naam, adres: str(p.formattedAddress) ?? "", website: str(p.websiteUri), rating: num(p.rating), aantal: num(p.userRatingCount) ?? 0 };
}

/** Bedrijven die bij een zoekterm passen (hooguit 5), optioneel rond een punt op de kaart. */
export async function zoekBedrijven(zoekterm: string, rond?: { lat: number; lng: number } | null): Promise<Kandidaat[]> {
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

/** Het profiel van één bedrijf, met de reviews die Google toont (hooguit 5). */
export async function bedrijfDetails(placeId: string): Promise<PlaatsDetails> {
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

/** Vergelijkbare bedrijven binnen 3 km (zelfde soort), zonder het bedrijf zelf. Faalt stil: dan zonder vergelijking. */
export async function concurrentenVan(d: PlaatsDetails): Promise<Concurrent[]> {
  if (!d.locatie) return [];
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
