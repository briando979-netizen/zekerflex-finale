import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Google Places (NEW) als databron voor echte telefoonnummers. Zoekt een bedrijf
// (naam + stad) via places:searchText en geeft het telefoonnummer + de website
// terug — de betrouwbaarste bron, veel beter dan domein-raden. Dormant zonder
// GOOGLE_MAPS_API_KEY; vereist de "Places API (New)" in Google Cloud.
// ---------------------------------------------------------------------------

export function placesEnabled(): boolean {
  return Boolean(env.GOOGLE_MAPS_API_KEY);
}

export interface PlacesContact {
  phone: string | null;
  website: string | null;
  matchedName: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function lookupCompanyContact(name: string, city?: string | null): Promise<PlacesContact | null> {
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
      return { phone: null, website: null, matchedName: null };
    }
    const data = (await res.json()) as { places?: Record<string, unknown>[] };
    const place = data.places?.[0] ?? {};
    const rawPhone = str(place.internationalPhoneNumber) ?? str(place.nationalPhoneNumber);
    const website = str(place.websiteUri);
    const dn = place.displayName && typeof place.displayName === "object" ? (place.displayName as Record<string, unknown>) : {};
    logger.info("places lookup", { name, hasPhone: Boolean(rawPhone), hasWebsite: Boolean(website) });
    return {
      phone: rawPhone ? rawPhone.replace(/[^\d+]/g, "") : null,
      website,
      matchedName: str(dn.text),
    };
  } catch (err) {
    logger.warn("places lookup error", { error: (err as Error).message });
    return null;
  }
}
