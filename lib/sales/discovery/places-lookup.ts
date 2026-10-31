import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Google Places-opzoeker: zoekt een bedrijf (naam + stad) en geeft het ECHTE
// telefoonnummer + de website terug. Dit is de betrouwbaarste bron voor
// telefoonnummers (veel beter dan domein-raden). Dormant zonder
// GOOGLE_MAPS_API_KEY; vereist dat de "Places API" in Google Cloud aanstaat.
// ---------------------------------------------------------------------------

export function placesEnabled(): boolean {
  return Boolean(env.GOOGLE_MAPS_API_KEY);
}

export interface PlacesContact {
  phone: string | null;
  website: string | null;
  matchedName: string | null;
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function lookupCompanyContact(name: string, city?: string | null): Promise<PlacesContact | null> {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;

  const query = encodeURIComponent([name, city].filter(Boolean).join(" ") + " Nederland");
  const search = await fetchJson(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&region=nl&language=nl&key=${key}`,
  );
  const results = Array.isArray(search?.results) ? (search!.results as Record<string, unknown>[]) : [];
  const placeId = str(results[0]?.place_id);
  if (!placeId) return { phone: null, website: null, matchedName: null };

  const det = await fetchJson(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}` +
      `&fields=formatted_phone_number,international_phone_number,website,name&language=nl&key=${key}`,
  );
  const r = (det?.result && typeof det.result === "object" ? det.result : {}) as Record<string, unknown>;
  const rawPhone = str(r.international_phone_number) ?? str(r.formatted_phone_number);
  const website = str(r.website);
  logger.info("places lookup", { name, hasPhone: Boolean(rawPhone), hasWebsite: Boolean(website) });
  return {
    phone: rawPhone ? rawPhone.replace(/[^\d+]/g, "") : null,
    website,
    matchedName: str(r.name),
  };
}
