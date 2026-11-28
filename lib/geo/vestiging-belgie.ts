import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { featureEnabled } from "@/lib/flags";
import type { Principal } from "@/lib/auth";
import { belgischeOpslagPostcode, belgischePostcode, WERK_IN_BELGIE_VLAG } from "@/lib/geo/vestiging-land";

// ---------------------------------------------------------------------------
// Een werklocatie in België op de kaart zetten (vlag `werk-in-belgie`, standaard uit). PDOK kent alleen Nederland, dus
// een Belgisch adres zoeken we op bij OpenStreetMap (Nominatim), gratis en zonder sleutel ("alles gratis",
// lib/gratis/diensten.ts → geocoderen). Dezelfde spelregels als de thuisbasis van een werker (lib/geo/thuisbasis.ts):
//   • alleen straat (met huisnummer), postcode, plaats en land gaan naar buiten; nooit de naam van het bedrijf;
//   • één aanvraag per seconde en een eerlijke User-Agent, via de wachtrij van lib/integrations/osm-plaatsen.ts;
//   • vindt OSM niets precies genoeg, dan een eerlijke fout; nooit stil het midden van Nederland of een postcodegebied,
//     want de geofence (inchecken) ligt op dit punt.
// Nominatim staat geen zoeken-tijdens-het-typen toe: het formulier zoekt alleen als je op "Adres zoeken" drukt.
// ---------------------------------------------------------------------------

const NOMINATIM_ZOEK = "https://nominatim.openstreetmap.org/search";
const TIMEOUT_MS = 8_000;
const CACHE_MS = 60 * 60_000;
const CACHE_MAX = 200;
/** place_rank van Nominatim: 26 is een straat, 30 een huis. Een plaats (16) of postcodegebied is geen werkplek. */
const MIN_RANG = 26;

export interface BelgischAdresInvoer {
  /** straat en huisnummer, bijv. "Meir 1" */
  straat: string;
  postcode: string;
  plaats?: string | null | undefined;
}

export interface BelgischAdres {
  latitude: number;
  longitude: number;
  /** zo bewaard: "BE-2000" (lib/geo/vestiging-land.ts) */
  postalCode: string;
  /** de plaats zoals het bedrijf hem schreef; anders die van OSM */
  city: string;
  /** straat en huisnummer zoals het bedrijf ze schreef */
  straat: string;
  /** "Meir 1, 2000 Antwerpen" */
  label: string;
}

type Uitslag = { soort: "gevonden"; latitude: number; longitude: number; plaats: string | null } | { soort: "niet-gevonden" } | { soort: "onbereikbaar" };

// Een uur onthouden; gedeeld via globalThis, want Next bundelt elke route apart.
const g = globalThis as unknown as { __zfVestigingBelgie?: Map<string, { tot: number; uitslag: Uitslag }> };
const cache = (g.__zfVestigingBelgie ??= new Map());

type NominatimRij = { lat?: unknown; lon?: unknown; place_rank?: unknown; address?: Record<string, unknown> };

function getal(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function tekst(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function plaatsUit(a: Record<string, unknown> | undefined): string | null {
  for (const k of ["city", "town", "village", "municipality", "suburb"]) {
    const v = tekst(a?.[k]);
    if (v) return v;
  }
  return null;
}

/**
 * Is deze treffer precies genoeg voor een werkplek? Minstens een straat, in België, en (als we zonder postcode zochten)
 * met de postcode die het bedrijf opgaf: anders kan het een straat met dezelfde naam in een andere wijk zijn.
 */
export function bruikbareTreffer(rij: NominatimRij | undefined, postcode: string, postcodeGevraagd: boolean): { latitude: number; longitude: number; plaats: string | null } | null {
  if (!rij) return null;
  const latitude = getal(rij.lat);
  const longitude = getal(rij.lon);
  if (latitude === null || longitude === null) return null;
  const rang = getal(rij.place_rank);
  if (rang !== null ? rang < MIN_RANG : !tekst(rij.address?.road)) return null;
  const land = tekst(rij.address?.country_code);
  if (land && land.toLowerCase() !== "be") return null;
  if (!postcodeGevraagd) {
    const pc = tekst(rij.address?.postcode);
    if (!pc || belgischePostcode(pc) !== postcode) return null;
  }
  return { latitude, longitude, plaats: plaatsUit(rij.address) };
}

async function vraag(velden: { street: string; postalcode?: string; city?: string }): Promise<NominatimRij[] | null> {
  const url = new URL(NOMINATIM_ZOEK);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "be");
  url.searchParams.set("street", velden.street);
  if (velden.postalcode) url.searchParams.set("postalcode", velden.postalcode);
  if (velden.city) url.searchParams.set("city", velden.city);
  const osm = await import("@/lib/integrations/osm-plaatsen");
  return osm.inDeRij("nominatim", osm.NOMINATIM_PAUZE_MS, async () => {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": osm.OSM_USER_AGENT, accept: "application/json", "accept-language": "nl" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        // alleen de status in het log; nooit het adres
        logger.warn("vestiging-belgie: nominatim gaf geen bruikbaar antwoord", { status: res.status });
        return null;
      }
      const json = (await res.json()) as unknown;
      return Array.isArray(json) ? (json as NominatimRij[]) : [];
    } catch (err) {
      logger.warn("vestiging-belgie: nominatim niet bereikbaar", { fout: (err as Error).message.slice(0, 120) });
      return null;
    }
  });
}

/**
 * Zoekt het adres op, van precies naar ruimer: straat + postcode + plaats; dan zonder plaats (die kan anders gespeld zijn,
 * "Anvers" tegenover "Antwerpen"); dan zonder postcode, maar alleen als OSM dan dezelfde postcode teruggeeft.
 */
async function zoek(straat: string, postcode: string, plaats: string | null): Promise<Uitslag> {
  const sleutel = `${straat.toLowerCase()}|${postcode}|${plaats?.toLowerCase() ?? ""}`;
  const hit = cache.get(sleutel);
  if (hit && hit.tot > Date.now()) return hit.uitslag;

  const pogingen: { street: string; postalcode?: string; city?: string }[] = [{ street: straat, postalcode: postcode, ...(plaats ? { city: plaats } : {}) }];
  if (plaats) pogingen.push({ street: straat, postalcode: postcode }, { street: straat, city: plaats });

  let uitslag: Uitslag = { soort: "niet-gevonden" };
  for (const poging of pogingen) {
    const rijen = await vraag(poging);
    if (rijen === null) {
      uitslag = { soort: "onbereikbaar" };
      break;
    }
    const treffer = bruikbareTreffer(rijen[0], postcode, Boolean(poging.postalcode));
    if (treffer) {
      uitslag = { soort: "gevonden", ...treffer };
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
export function vestigingBelgieVergeetAlles(): void {
  cache.clear();
}

/**
 * Een Belgisch adres als coördinaat. Een fout heeft altijd een `details.reden`, zodat het formulier de melding in de taal
 * van de pagina toont (components/werkgever/BelgischAdres.tsx): belgie-straat, belgie-postcode, belgie-niet-gevonden of
 * belgie-onbereikbaar.
 */
export async function zoekBelgischAdres(invoer: BelgischAdresInvoer): Promise<BelgischAdres> {
  const straat = invoer.straat.trim().replace(/\s+/g, " ");
  const postcode = belgischePostcode(invoer.postcode);
  const plaats = invoer.plaats?.trim().replace(/\s+/g, " ") || null;
  // met huisnummer: de geofence (inchecken) ligt op dit punt, een hele straat is te ruim
  if (straat.length < 3 || !/\d/.test(straat)) {
    throw AppError.validation("Vul de straat en het huisnummer in.", { reden: "belgie-straat" });
  }
  if (!postcode) {
    throw AppError.validation("Vul een Belgische postcode in: vier cijfers, bijvoorbeeld 2000.", { reden: "belgie-postcode" });
  }
  const u = await zoek(straat, postcode, plaats);
  if (u.soort === "onbereikbaar") {
    throw new AppError("UPSTREAM_UNAVAILABLE", "Het adres kon nu niet worden opgezocht. Probeer het over een minuut opnieuw.", 503, {
      reden: "belgie-onbereikbaar",
    });
  }
  if (u.soort === "niet-gevonden") {
    throw AppError.validation("We vonden dit adres niet in België. Controleer de straat, het huisnummer, de postcode en de plaats.", {
      reden: "belgie-niet-gevonden",
    });
  }
  const city = plaats ?? u.plaats ?? "";
  return {
    latitude: u.latitude,
    longitude: u.longitude,
    postalCode: belgischeOpslagPostcode(postcode) ?? `BE-${postcode}`,
    city,
    straat,
    label: `${straat}, ${postcode}${city ? ` ${city}` : ""}`,
  };
}

/** Staat werken in België aan voor deze gebruiker (ook vroege toegang per gebruiker of rol)? Nooit een fout: bij twijfel uit. */
export async function werkInBelgieAan(wie: Pick<Principal, "userId"> & { memberships?: Pick<Principal["memberships"][number], "role">[] | undefined }): Promise<boolean> {
  const roles = wie.memberships?.map((m) => m.role) ?? [];
  return featureEnabled(WERK_IN_BELGIE_VLAG, { userId: wie.userId, roles }).catch(() => false);
}
