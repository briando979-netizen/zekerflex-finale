// ---------------------------------------------------------------------------
// Straal-rekenwerk voor het locatiefilter op de gebruikerspagina van de admin.
// Puur (geen database, geen fetch) zodat de client én de test hetzelfde
// gebruiken. Het zoeken naar een plaats of postcode gaat via /api/geo/search.
// ---------------------------------------------------------------------------

export const STRAAL_OPTIES_KM = [5, 10, 20, 50] as const;
export type StraalKm = (typeof STRAAL_OPTIES_KM)[number];
export const STANDAARD_STRAAL_KM: StraalKm = 20;

export interface Punt {
  lat: number;
  lon: number;
}

const AARDE_STRAAL_KM = 6371;

/** Grootcirkelafstand in kilometers (haversine). */
export function afstandKm(a: Punt, b: Punt): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * AARDE_STRAAL_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ligt de werker binnen de straal rond het gekozen punt? Zonder coördinaten: nee. */
export function binnenStraal(middelpunt: Punt, straalKm: number, werker: Punt | undefined): boolean {
  if (!werker) return false;
  return afstandKm(middelpunt, werker) <= straalKm;
}

/** Een invoer die op een postcode lijkt ("9711", "9711 TN", "9711tn"). */
export function lijktOpPostcode(invoer: string): boolean {
  return /^\d{4}\s?[a-z]{0,2}$/i.test(invoer.trim());
}
