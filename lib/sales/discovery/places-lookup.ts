import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { bedrijvenBron, osmZoekBedrijven, type BedrijvenBron } from "@/lib/integrations/osm-plaatsen";

// ---------------------------------------------------------------------------
// Een bedrijf opzoeken voor echte contactgegevens: telefoonnummer en website.
// Veel beter dan domein-raden. Twee bronnen, in deze volgorde:
//
//   1. OpenStreetMap (lib/integrations/osm-plaatsen.ts) — onze eigen bron:
//      gratis, zonder sleutel. Hij gaat vóór zodra "alles gratis" aanstaat of
//      er geen Google-sleutel is, en is anders de terugval.
//   2. Google Places (NEW) met GOOGLE_MAPS_API_KEY ("Places API (New)"),
//      per opvraging afgerekend.
//
// Beide geven alleen openbare bedrijfsgegevens. Beoordelingen horen hier niet
// bij: die hebben we voor een lead niet nodig en OSM kent ze niet.
// ---------------------------------------------------------------------------

/** Staat de betaalde Google-bron klaar? Er is altijd een bron: zonder sleutel pakken we OSM. */
export function placesEnabled(): boolean {
  return Boolean(env.GOOGLE_MAPS_API_KEY);
}

export interface PlacesContact {
  phone: string | null;
  website: string | null;
  matchedName: string | null;
  /** waar dit antwoord vandaan komt */
  bron: BedrijvenBron;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const kaalNummer = (ruw: string | null): string | null => (ruw ? ruw.replace(/[^\d+]/g, "") : null);

/**
 * Telefoon + website van één bedrijf (naam, eventueel met stad). Null als geen
 * van de bronnen iets wist. Google eerst als zijn sleutel er is en "alles
 * gratis" uit staat; vindt die niets, dan onze eigen bron.
 */
export async function lookupCompanyContact(name: string, city?: string | null): Promise<PlacesContact | null> {
  if (!name.trim()) return null;
  if ((await bedrijvenBron()) === "google") {
    const viaGoogle = await viaGoogleContact(name, city);
    if (viaGoogle?.phone || viaGoogle?.website) return viaGoogle;
    return (await viaOsmContact(name, city)) ?? viaGoogle;
  }
  return viaOsmContact(name, city);
}

async function viaOsmContact(name: string, city?: string | null): Promise<PlacesContact | null> {
  const lijst = await osmZoekBedrijven([name, city].filter(Boolean).join(" "), { aantal: 3 });
  const match = lijst.find((p) => p.telefoon !== null || p.website !== null) ?? lijst[0];
  if (!match) return null;
  logger.info("bedrijf opgezocht bij onze eigen bron", { hasPhone: Boolean(match.telefoon), hasWebsite: Boolean(match.website) });
  return { phone: kaalNummer(match.telefoon), website: match.website, matchedName: match.naam, bron: "osm" };
}

async function viaGoogleContact(name: string, city?: string | null): Promise<PlacesContact | null> {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.displayName,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri",
      },
      body: JSON.stringify({
        textQuery: [name, city].filter(Boolean).join(" ") + " Nederland",
        languageCode: "nl",
        regionCode: "NL",
        maxResultCount: 1,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn("places lookup failed", { status: res.status });
      return { phone: null, website: null, matchedName: null, bron: "google" };
    }
    const data = (await res.json()) as { places?: Record<string, unknown>[] };
    const place = data.places?.[0] ?? {};
    const rawPhone = str(place.internationalPhoneNumber) ?? str(place.nationalPhoneNumber);
    const website = str(place.websiteUri);
    const dn = place.displayName && typeof place.displayName === "object" ? (place.displayName as Record<string, unknown>) : {};
    logger.info("places lookup", { name, hasPhone: Boolean(rawPhone), hasWebsite: Boolean(website) });
    return { phone: kaalNummer(rawPhone), website, matchedName: str(dn.text), bron: "google" };
  } catch (err) {
    logger.warn("places lookup error", { error: (err as Error).message });
    return null;
  }
}
