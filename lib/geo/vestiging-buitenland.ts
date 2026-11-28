import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { featureEnabled } from "@/lib/flags";
import type { Principal } from "@/lib/auth";
import { landNaam } from "@/lib/werkrecht/landen";
import {
  belgischePostcode,
  buitenlandsePostcode,
  controleerVestigingPostcode,
  heeftPostcode,
  isVestigingLand,
  isVlaamsePostcode,
  landKeuzes,
  NIET_VLAANDEREN_MELDING,
  opslagPostcode,
  werklocatieLanden,
  WERK_IN_BELGIE_VLAG,
  WERK_IN_BUITENLAND_VLAG,
  type LandKeuze,
} from "@/lib/geo/vestiging-land";

// ---------------------------------------------------------------------------
// Een werklocatie buiten Nederland op de kaart zetten (vlag `werk-in-belgie` voor België, `werk-in-buitenland` voor elk
// land; beide standaard uit). PDOK kent alleen Nederland, dus zo'n adres zoeken we op bij OpenStreetMap (Nominatim),
// gratis en zonder sleutel ("alles gratis", lib/gratis/diensten.ts → geocoderen), met `countrycodes` van het gekozen land.
// Dezelfde spelregels als de thuisbasis van een werker (lib/geo/thuisbasis.ts):
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

export interface BuitenlandsAdresInvoer {
  /** ISO-landcode, bijv. "BE" of "DE" */
  land: string;
  /** straat en huisnummer, bijv. "Meir 1" */
  straat: string;
  /** leeg mag alleen in een land zonder postcodes (heeftPostcode) */
  postcode?: string | null | undefined;
  plaats?: string | null | undefined;
}

export interface BuitenlandsAdres {
  latitude: number;
  longitude: number;
  /** zo bewaard: "BE-2000", of "AE-" in een land zonder postcode (lib/geo/vestiging-land.ts) */
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
const g = globalThis as unknown as { __zfVestigingBuitenland?: Map<string, { tot: number; uitslag: Uitslag }> };
const cache = (g.__zfVestigingBuitenland ??= new Map());

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

/** Twee postcodes gelijk? Zonder spaties en streepjes ("SW1A 1AA" = "SW1A1AA"); in België de vier cijfers. */
function zelfdePostcode(land: string, a: string, b: string): boolean {
  if (land === "BE") return belgischePostcode(a) !== null && belgischePostcode(a) === belgischePostcode(b);
  const kaal = (p: string) => p.replace(/[\s-]/g, "").toUpperCase();
  return kaal(a) === kaal(b);
}

/**
 * Is deze treffer precies genoeg voor een werkplek? Minstens een straat, in het gekozen land, en (als we zonder postcode
 * zochten terwijl het bedrijf er een opgaf) niet met een andere postcode: anders kan het een straat met dezelfde naam in
 * een andere wijk zijn. Heeft OSM bij het adres geen postcode, dan telt de plaats.
 */
export function bruikbareTreffer(
  rij: NominatimRij | undefined,
  land: string,
  postcode: string,
  postcodeGevraagd: boolean,
): { latitude: number; longitude: number; plaats: string | null } | null {
  if (!rij) return null;
  const latitude = getal(rij.lat);
  const longitude = getal(rij.lon);
  if (latitude === null || longitude === null) return null;
  const rang = getal(rij.place_rank);
  if (rang !== null ? rang < MIN_RANG : !tekst(rij.address?.road)) return null;
  const cc = tekst(rij.address?.country_code);
  if (cc && cc.toUpperCase() !== land) return null;
  if (!postcodeGevraagd && postcode) {
    const pc = tekst(rij.address?.postcode);
    // België zoals vanaf het begin (28 nov 2026): de postcode moet er staan en gelijk zijn; elders mag hij ontbreken, want
    // daar heeft OSM lang niet bij elk adres een postcode (Ierland, …)
    if (pc ? !zelfdePostcode(land, pc, postcode) : land === "BE") return null;
  }
  return { latitude, longitude, plaats: plaatsUit(rij.address) };
}

async function vraag(land: string, velden: { street: string; postalcode?: string; city?: string }): Promise<NominatimRij[] | null> {
  const url = new URL(NOMINATIM_ZOEK);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", land.toLowerCase());
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
        // alleen het land en de status in het log; nooit het adres
        logger.warn("vestiging-buitenland: nominatim gaf geen bruikbaar antwoord", { land, status: res.status });
        return null;
      }
      const json = (await res.json()) as unknown;
      return Array.isArray(json) ? (json as NominatimRij[]) : [];
    } catch (err) {
      logger.warn("vestiging-buitenland: nominatim niet bereikbaar", { land, fout: (err as Error).message.slice(0, 120) });
      return null;
    }
  });
}

/**
 * Zoekt het adres op, van precies naar ruimer. Met postcode: straat + postcode + plaats; dan zonder plaats (die kan anders
 * gespeld zijn, "Anvers" tegenover "Antwerpen"); dan zonder postcode, maar niet als OSM dan een andere postcode geeft.
 * Zonder postcode (een land zonder postcodes): straat + plaats.
 */
async function zoek(land: string, straat: string, postcode: string, plaats: string | null): Promise<Uitslag> {
  const sleutel = `${land}|${straat.toLowerCase()}|${postcode}|${plaats?.toLowerCase() ?? ""}`;
  const hit = cache.get(sleutel);
  if (hit && hit.tot > Date.now()) return hit.uitslag;

  const pogingen: { street: string; postalcode?: string; city?: string }[] = postcode
    ? [{ street: straat, postalcode: postcode, ...(plaats ? { city: plaats } : {}) }]
    : [{ street: straat, ...(plaats ? { city: plaats } : {}) }];
  if (postcode && plaats) pogingen.push({ street: straat, postalcode: postcode }, { street: straat, city: plaats });

  let uitslag: Uitslag = { soort: "niet-gevonden" };
  for (const poging of pogingen) {
    const rijen = await vraag(land, poging);
    if (rijen === null) {
      uitslag = { soort: "onbereikbaar" };
      break;
    }
    const treffer = bruikbareTreffer(rijen[0], land, postcode, Boolean(poging.postalcode));
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
export function vestigingBuitenlandVergeetAlles(): void {
  cache.clear();
}

/**
 * Een adres buiten Nederland als coördinaat. Een fout heeft altijd een `details.reden`, zodat het formulier de melding in
 * de taal van de pagina toont (components/werkgever/BuitenlandAdres.tsx): buitenland-land, buitenland-straat,
 * buitenland-postcode, buitenland-plaats, buitenland-niet-gevonden of buitenland-onbereikbaar.
 */
export async function zoekBuitenlandsAdres(invoer: BuitenlandsAdresInvoer): Promise<BuitenlandsAdres> {
  const land = invoer.land.trim().toUpperCase();
  if (land === "NL" || !isVestigingLand(land)) throw AppError.validation("Kies een land uit de lijst.", { reden: "buitenland-land" });
  const straat = invoer.straat.trim().replace(/\s+/g, " ");
  const postcode = buitenlandsePostcode(land, invoer.postcode ?? "");
  const plaats = invoer.plaats?.trim().replace(/\s+/g, " ") || null;
  // met huisnummer: de geofence (inchecken) ligt op dit punt, een hele straat is te ruim
  if (straat.length < 3 || !/\d/.test(straat)) {
    throw AppError.validation("Vul de straat en het huisnummer in.", { reden: "buitenland-straat" });
  }
  if (postcode === null || (postcode === "" && heeftPostcode(land))) {
    throw AppError.validation(
      land === "BE" ? "Vul een Belgische postcode in: vier cijfers, bijvoorbeeld 2000." : "Vul een geldige postcode in: 1 tot 10 letters of cijfers.",
      { reden: "buitenland-postcode" },
    );
  }
  // België: voorlopig alleen Vlaanderen (lib/geo/vestiging-land.ts → isVlaamsePostcode); dan gaat er ook niets naar buiten
  if (land === "BE" && !isVlaamsePostcode(postcode)) throw AppError.validation(NIET_VLAANDEREN_MELDING, { reden: "buitenland-vlaanderen" });
  if (!postcode && !plaats) throw AppError.validation("Vul de plaats in.", { reden: "buitenland-plaats" });
  const u = await zoek(land, straat, postcode, plaats);
  if (u.soort === "onbereikbaar") {
    throw new AppError("UPSTREAM_UNAVAILABLE", "Het adres kon nu niet worden opgezocht. Probeer het over een minuut opnieuw.", 503, {
      reden: "buitenland-onbereikbaar",
    });
  }
  if (u.soort === "niet-gevonden") {
    throw AppError.validation(`We vonden dit adres niet in ${landNaam(land, "nl")}. Controleer de straat, het huisnummer, de postcode en de plaats.`, {
      reden: "buitenland-niet-gevonden",
    });
  }
  const city = plaats ?? u.plaats ?? "";
  return {
    latitude: u.latitude,
    longitude: u.longitude,
    postalCode: opslagPostcode(land, postcode) ?? `${land}-${postcode}`,
    city,
    straat,
    label: [straat, `${postcode} ${city}`.trim()].filter(Boolean).join(", "),
  };
}

type Wie = Pick<Principal, "userId"> & { memberships?: Pick<Principal["memberships"][number], "role">[] | undefined };

/** De landen die dit bedrijf mag kiezen (ook vroege toegang per gebruiker of rol). Nooit een fout: bij twijfel alleen Nederland. */
export async function werklocatieLandenVoor(wie: Wie): Promise<readonly string[]> {
  const ctx = { userId: wie.userId, roles: wie.memberships?.map((m) => m.role) ?? [] };
  const [belgie, buitenland] = await Promise.all([
    featureEnabled(WERK_IN_BELGIE_VLAG, ctx).catch(() => false),
    featureEnabled(WERK_IN_BUITENLAND_VLAG, ctx).catch(() => false),
  ]);
  return werklocatieLanden({ belgie, buitenland });
}

/**
 * De servercontrole van de postcode van een werklocatie (POST en PATCH /api/werkgever/branches, de eenmalige locatie bij een
 * klus), via controleerVestigingPostcode. Een Nederlandse postcode kijkt niet eens naar de vlaggen: die gaat zoals altijd. Een
 * fout is een 422; bij een Nederlandse postcode met de oude tekst "Controleer de ingevulde gegevens". Geeft de postcode terug
 * zoals hij bewaard wordt.
 */
export async function controleerWerklocatiePostcode(postalCode: string, wie: Wie, algemeen = "Controleer de ingevulde gegevens"): Promise<string> {
  let uit = controleerVestigingPostcode(postalCode, ["NL"]);
  if (!uit.ok && uit.buitenland) uit = controleerVestigingPostcode(postalCode, await werklocatieLandenVoor(wie));
  if (uit.ok) return uit.postalCode;
  throw AppError.validation(uit.buitenland ? uit.melding : algemeen, { fieldErrors: { postalCode: [uit.melding] }, formErrors: [] });
}

/**
 * De keuzelijst voor het formulier (namen in de taal van de lezer), of null als alleen Nederland mag: dan toont het
 * formulier geen keuze en is alles zoals het was.
 */
export async function werklocatieKeuzes(wie: Wie, locale: string): Promise<LandKeuze[] | null> {
  const landen = await werklocatieLandenVoor(wie);
  return landen.length > 1 ? landKeuzes(landen, locale) : null;
}
