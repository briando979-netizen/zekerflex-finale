import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { geocodePostcode, type GeocodeResult } from "@/lib/integrations/pdok";
import { buitenlandPostcode } from "@/lib/geo/thuisland";

// ---------------------------------------------------------------------------
// De thuisbasis van een werker op de kaart zetten (reisafstand bij matching).
//   • Nederland: PDOK, zoals altijd (lib/integrations/pdok.ts). Is PDOK even weg,
//     dan blijft het "bij benadering" en kan de werker verder.
//   • Buitenland: OpenStreetMap (Nominatim), gratis en zonder sleutel ("alles
//     gratis", lib/gratis/diensten.ts → geocoderen). Alleen postcode, plaats en
//     land gaan naar buiten: nooit een naam of huisnummer. Vindt OSM niets, dan
//     een eerlijke fout; nooit stil het midden van Nederland.
// De spelregels van OSM (één aanvraag per seconde, eerlijke User-Agent) lopen
// via dezelfde wachtrij als lib/integrations/osm-plaatsen.ts.
// ---------------------------------------------------------------------------

const NOMINATIM_ZOEK = "https://nominatim.openstreetmap.org/search";
const TIMEOUT_MS = 8_000;
const CACHE_MS = 60 * 60_000;
const CACHE_MAX = 200;

export type BuitenlandUitslag =
  | { soort: "gevonden"; latitude: number; longitude: number; plaats: string | null }
  | { soort: "niet-gevonden" }
  | { soort: "onbereikbaar" };

// Een uur onthouden (de controle vóór de ID-scan en het insturen erna vragen
// hetzelfde); gedeeld via globalThis, want Next bundelt elke route apart.
const g = globalThis as unknown as { __zfThuisbasisCache?: Map<string, { tot: number; uitslag: BuitenlandUitslag }> };
const cache = (g.__zfThuisbasisCache ??= new Map());

type NominatimRij = { lat?: unknown; lon?: unknown; address?: Record<string, unknown> };

function getal(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function plaatsUit(a: Record<string, unknown> | undefined): string | null {
  for (const k of ["city", "town", "village", "municipality", "suburb"]) {
    const v = a?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

async function vraag(land: string, postcode: string, plaats: string | null): Promise<NominatimRij[] | null> {
  const url = new URL(NOMINATIM_ZOEK);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", land.toLowerCase());
  url.searchParams.set("postalcode", postcode);
  if (plaats) url.searchParams.set("city", plaats);
  // pas hier laden: het Nederlandse pad (PDOK) heeft OSM niet nodig
  const osm = await import("@/lib/integrations/osm-plaatsen");
  return osm.inDeRij("nominatim", osm.NOMINATIM_PAUZE_MS, async () => {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": osm.OSM_USER_AGENT, accept: "application/json", "accept-language": "nl" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        // alleen het land en de status in het log; nooit de postcode of plaats
        logger.warn("thuisbasis: nominatim gaf geen bruikbaar antwoord", { land, status: res.status });
        return null;
      }
      const json = (await res.json()) as unknown;
      return Array.isArray(json) ? (json as NominatimRij[]) : [];
    } catch (err) {
      logger.warn("thuisbasis: nominatim niet bereikbaar", { land, fout: (err as Error).message.slice(0, 120) });
      return null;
    }
  });
}

/**
 * Zoekt een postcode in het buitenland op. Eerst met de plaats erbij (precies);
 * vindt dat niets, dan alleen de postcode (de plaats kan anders gespeld zijn,
 * bijvoorbeeld "Antwerpen" tegenover "Anvers").
 */
export async function zoekThuisbasisBuitenland(land: string, postcode: string, plaats: string | null): Promise<BuitenlandUitslag> {
  const pc = postcode.trim().replace(/\s+/g, " ").toUpperCase();
  const pl = plaats?.trim() || null;
  const sleutel = `${land}|${pc}|${pl?.toLowerCase() ?? ""}`;
  const hit = cache.get(sleutel);
  if (hit && hit.tot > Date.now()) return hit.uitslag;

  let uitslag: BuitenlandUitslag = { soort: "niet-gevonden" };
  for (const metPlaats of pl ? [pl, null] : [null]) {
    const rijen = await vraag(land, pc, metPlaats);
    if (rijen === null) {
      uitslag = { soort: "onbereikbaar" };
      break;
    }
    const rij = rijen[0];
    const lat = getal(rij?.lat);
    const lng = getal(rij?.lon);
    if (rij && lat !== null && lng !== null) {
      uitslag = { soort: "gevonden", latitude: lat, longitude: lng, plaats: plaatsUit(rij.address) ?? pl };
      break;
    }
  }
  // "onbereikbaar" niet onthouden: over een minuut kan het weer gaan
  if (uitslag.soort !== "onbereikbaar") {
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(sleutel, { tot: Date.now() + CACHE_MS, uitslag });
  }
  return uitslag;
}

/** Alleen voor tests. */
export function thuisbasisVergeetAlles(): void {
  cache.clear();
}

/**
 * De thuisbasis als coördinaat. Nederland via PDOK; buitenland via OSM, met een
 * fout die de werker in zijn eigen taal te zien krijgt (`details.reden`, zie
 * components/app/ThuisbasisVelden.tsx) als het adres niet te vinden is.
 */
export async function geocodeThuisbasis(input: {
  land: string;
  postcode: string;
  plaats?: string | null | undefined;
  huisnummer?: string | undefined;
}): Promise<GeocodeResult> {
  if (input.land === "NL") return geocodePostcode(input.postcode, input.huisnummer);
  const u = await zoekThuisbasisBuitenland(input.land, input.postcode, input.plaats ?? null);
  if (u.soort === "gevonden") {
    return {
      latitude: u.latitude,
      longitude: u.longitude,
      postalCode: buitenlandPostcode(input.land, input.postcode),
      city: u.plaats,
      street: null,
      approximate: false,
    };
  }
  if (u.soort === "niet-gevonden") {
    throw AppError.validation("We vonden deze postcode niet in het gekozen land. Controleer de postcode en de woonplaats.", {
      reden: "thuisbasis-niet-gevonden",
    });
  }
  throw new AppError("UPSTREAM_UNAVAILABLE", "Het adres kon nu niet worden opgezocht. Probeer het over een minuut opnieuw.", 503, {
    reden: "thuisbasis-onbereikbaar",
  });
}
