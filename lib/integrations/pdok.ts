import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// PDOK Locatieserver — the Dutch government's own geocoding service.
// Free, no API key, EU-hosted. Used to turn a postcode + house number into a
// coordinate for the freelancer's home base (travel-time estimation).
// Falls back to the centre of the Netherlands when unreachable so onboarding
// never hard-fails on a geocode.
// ---------------------------------------------------------------------------

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  postalCode: string;
  city: string | null;
  street: string | null;
  approximate: boolean;
}

const NL_CENTRE: Omit<GeocodeResult, "postalCode"> = {
  latitude: 52.1326,
  longitude: 5.2913,
  city: null,
  street: null,
  approximate: true,
};

function parsePoint(wkt: string | undefined): { lat: number; lng: number } | null {
  // "POINT(5.12100 52.09000)" -> lng lat
  const m = wkt?.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!m) return null;
  return { lng: Number(m[1]), lat: Number(m[2]) };
}

export async function geocodePostcode(
  postcodeRaw: string,
  houseNumber?: string,
): Promise<GeocodeResult> {
  const postcode = postcodeRaw.replace(/\s+/g, "").toUpperCase();
  const q = houseNumber ? `${postcode} ${houseNumber}` : postcode;

  try {
    const url = new URL("https://api.pdok.nl/bzk/locatieserver/search/v3_1/free");
    url.searchParams.set("q", q);
    url.searchParams.set("fq", houseNumber ? "type:adres" : "type:(adres OR postcode)");
    url.searchParams.set("rows", "1");
    url.searchParams.set("fl", "centroide_ll,woonplaatsnaam,straatnaam,postcode");

    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`PDOK HTTP ${res.status}`);

    const json = (await res.json()) as {
      response?: { docs?: { centroide_ll?: string; woonplaatsnaam?: string; straatnaam?: string; postcode?: string }[] };
    };
    const doc = json.response?.docs?.[0];
    const point = parsePoint(doc?.centroide_ll);
    if (!doc || !point) throw new Error("no match");

    return {
      latitude: point.lat,
      longitude: point.lng,
      postalCode: doc.postcode ?? postcode,
      city: doc.woonplaatsnaam ?? null,
      street: doc.straatnaam ?? null,
      approximate: false,
    };
  } catch (err) {
    logger.warn("pdok geocode failed, using NL centre", {
      postcode,
      error: (err as Error).message,
    });
    return { ...NL_CENTRE, postalCode: postcode };
  }
}
