import { haversineMeters } from "@/lib/geo/geofencing";
import type { GeoPoint } from "@/types/matching";
import type { TravelMode } from "@prisma/client";

// ---------------------------------------------------------------------------
// Onze eigen reistijd- en afstandsschatting: puur rekenwerk op twee
// coördinaten, zonder netwerk, zonder sleutel en dus zonder kosten. Hiermee
// kan het platform zonder Google Distance Matrix (zie lib/gratis/diensten.ts,
// post "reistijd"); lib/geo/travel-time.ts kiest welke van de twee hij pakt.
//
// Hoe het rekent:
//   1. hemelsbrede afstand (haversine) × een wegfactor → de echte weg is altijd
//      langer dan de rechte lijn;
//   2. een gemiddelde snelheid die meegroeit met de afstand — 3 km rijden gaat
//      nooit met 90 km/u, 150 km rijden bijna helemaal over de snelweg, en de
//      trein wint het op lange ritten juist van de auto;
//   3. vaste opstapminuten: parkeren en lopen naar de ingang, wachten op de bus,
//      de fiets stallen.
// Alle drie hangen af van de omgeving: binnen één stad staat alles stil, buiten
// de stad rijdt het door maar rijdt de bus bijna niet.
//
// Een gewone schatting zit hiermee op zo'n 10-20% van wat Google zegt. Dat is
// genoeg om op reisafstand te matchen; voor een vertrektijd op de minuut is een
// echte routeserver nodig (later, op onze eigen VPS).
//
// Zie ook lib/geo/travel-modes.ts: dat is de kleine, synchrone variant die de
// klussenkaartjes in de werker-app van een "auto / OV / fiets / lopen"-regel
// voorziet.
// ---------------------------------------------------------------------------

/** Wat voor rit het is: binnen één stad, van of naar een stad, of buitengebied. */
export type Omgeving = "stad" | "gemengd" | "buitengebied";

interface Profiel {
  /** Hoeveel langer de weg is dan de hemelsbrede lijn. */
  wegfactor: number;
  /** km/u bij een hele korte rit. */
  basisSnelheid: number;
  /** km/u waar een lange rit naartoe kruipt (snelweg, trein). */
  topSnelheid: number;
  /** Bij hoeveel weg-km je halverwege basis en top zit. */
  halveWeg: number;
  /** Vaste minuten erbij: parkeren, wachten, stallen. */
  opstapMinuten: number;
}

// Auto: binnen de stad traag en zoeken naar een plek; buiten de stad vlot en
// over langere afstand bijna snelwegsnelheid. De wegfactor 1,35 voor "gemengd"
// is dezelfde die de kilometeradministratie gebruikt (lib/worker/mileage.ts).
const PROFIEL: Record<TravelMode, Record<Omgeving, Profiel>> = {
  DRIVING: {
    stad: { wegfactor: 1.45, basisSnelheid: 20, topSnelheid: 65, halveWeg: 15, opstapMinuten: 7 },
    gemengd: { wegfactor: 1.35, basisSnelheid: 26, topSnelheid: 95, halveWeg: 18, opstapMinuten: 5 },
    buitengebied: { wegfactor: 1.3, basisSnelheid: 34, topSnelheid: 100, halveWeg: 20, opstapMinuten: 3 },
  },
  TRANSIT: {
    stad: { wegfactor: 1.4, basisSnelheid: 14, topSnelheid: 45, halveWeg: 18, opstapMinuten: 10 },
    gemengd: { wegfactor: 1.4, basisSnelheid: 15, topSnelheid: 78, halveWeg: 22, opstapMinuten: 14 },
    buitengebied: { wegfactor: 1.5, basisSnelheid: 12, topSnelheid: 70, halveWeg: 30, opstapMinuten: 20 },
  },
  BICYCLING: {
    stad: { wegfactor: 1.3, basisSnelheid: 13.5, topSnelheid: 13.5, halveWeg: 10, opstapMinuten: 2 },
    gemengd: { wegfactor: 1.25, basisSnelheid: 15, topSnelheid: 15, halveWeg: 10, opstapMinuten: 2 },
    buitengebied: { wegfactor: 1.25, basisSnelheid: 16.5, topSnelheid: 16.5, halveWeg: 10, opstapMinuten: 1 },
  },
  WALKING: {
    stad: { wegfactor: 1.25, basisSnelheid: 4.6, topSnelheid: 4.6, halveWeg: 10, opstapMinuten: 0 },
    gemengd: { wegfactor: 1.2, basisSnelheid: 4.8, topSnelheid: 4.8, halveWeg: 10, opstapMinuten: 0 },
    buitengebied: { wegfactor: 1.2, basisSnelheid: 5, topSnelheid: 5, halveWeg: 10, opstapMinuten: 0 },
  },
};

interface Stad {
  naam: string;
  lat: number;
  lon: number;
  /** Straal in km waarbinnen we het nog "in de stad" rekenen. */
  straal: number;
}

/** De grote Nederlandse steden met hun centrum: genoeg om stad van buitengebied te scheiden. */
const STEDEN: Stad[] = [
  { naam: "Amsterdam", lat: 52.3731, lon: 4.8922, straal: 10 },
  { naam: "Rotterdam", lat: 51.9244, lon: 4.4777, straal: 10 },
  { naam: "Den Haag", lat: 52.0705, lon: 4.3007, straal: 9 },
  { naam: "Utrecht", lat: 52.0907, lon: 5.1214, straal: 8 },
  { naam: "Eindhoven", lat: 51.4416, lon: 5.4697, straal: 7 },
  { naam: "Groningen", lat: 53.2194, lon: 6.5665, straal: 6 },
  { naam: "Tilburg", lat: 51.5555, lon: 5.0913, straal: 6 },
  { naam: "Almere", lat: 52.3508, lon: 5.2647, straal: 6 },
  { naam: "Breda", lat: 51.5719, lon: 4.7683, straal: 6 },
  { naam: "Nijmegen", lat: 51.8426, lon: 5.8528, straal: 6 },
  { naam: "Arnhem", lat: 51.9851, lon: 5.8987, straal: 6 },
  { naam: "Apeldoorn", lat: 52.2112, lon: 5.9699, straal: 5 },
  { naam: "Haarlem", lat: 52.3874, lon: 4.6462, straal: 5 },
  { naam: "Enschede", lat: 52.2215, lon: 6.8937, straal: 5 },
  { naam: "Amersfoort", lat: 52.1561, lon: 5.3878, straal: 5 },
  { naam: "Zaanstad", lat: 52.4389, lon: 4.8296, straal: 5 },
  { naam: "'s-Hertogenbosch", lat: 51.6978, lon: 5.3037, straal: 5 },
  { naam: "Zwolle", lat: 52.5168, lon: 6.083, straal: 5 },
  { naam: "Leiden", lat: 52.1601, lon: 4.497, straal: 5 },
  { naam: "Maastricht", lat: 50.8514, lon: 5.691, straal: 5 },
  { naam: "Dordrecht", lat: 51.8133, lon: 4.6901, straal: 5 },
  { naam: "Leeuwarden", lat: 53.2012, lon: 5.7999, straal: 5 },
  { naam: "Delft", lat: 52.0116, lon: 4.3571, straal: 4 },
  { naam: "Alkmaar", lat: 52.6324, lon: 4.7534, straal: 4 },
];

/** In welke grote stad ligt dit punt? Null als het daarbuiten valt. */
export function stadBij(punt: GeoPoint): string | null {
  for (const stad of STEDEN) {
    const meters = haversineMeters(punt, { latitude: stad.lat, longitude: stad.lon });
    if (meters <= stad.straal * 1000) return stad.naam;
  }
  return null;
}

/**
 * Wat voor rit dit is. Binnen dezelfde stad rekenen we met stadssnelheden; van
 * de ene stad naar de andere is "gemengd", want zo'n rit gaat vooral over de
 * snelweg of met de trein. Vanaf 15 km hemelsbreed is het nooit meer een ritje
 * binnen de stad.
 */
export function bepaalOmgeving(van: GeoPoint, naar: GeoPoint): Omgeving {
  const stadVan = stadBij(van);
  const stadNaar = stadBij(naar);
  if (!stadVan && !stadNaar) return "buitengebied";
  if (stadVan && stadVan === stadNaar && haversineMeters(van, naar) <= 15_000) return "stad";
  return "gemengd";
}

const hemelsbreed = (meters: number) => (Number.isFinite(meters) ? Math.max(0, meters) : 0);

/** De afstand over de weg in meters: de rechte lijn maal de wegfactor. */
export function wegMeters(
  hemelsbreedMeters: number,
  mode: TravelMode,
  omgeving: Omgeving = "gemengd",
): number {
  return Math.round(hemelsbreed(hemelsbreedMeters) * PROFIEL[mode][omgeving].wegfactor);
}

/**
 * De gemiddelde snelheid in km/u voor een rit van dit aantal weg-kilometers.
 * Hij loopt van de basissnelheid (vlak bij huis) naar de topsnelheid (lange
 * rit), zodat één getal niet voor zowel 2 als 200 km hoeft te kloppen.
 */
export function reisSnelheidKmu(
  wegKm: number,
  mode: TravelMode,
  omgeving: Omgeving = "gemengd",
): number {
  const p = PROFIEL[mode][omgeving];
  const km = Number.isFinite(wegKm) ? Math.max(0, wegKm) : 0;
  return p.basisSnelheid + (p.topSnelheid - p.basisSnelheid) * (km / (km + p.halveWeg));
}

export interface EigenSchatting {
  mode: TravelMode;
  /** Deur tot deur, inclusief de opstapminuten. */
  durationMinutes: number;
  /** Over de weg, niet hemelsbreed. */
  distanceMeters: number;
  /** Waar we mee gerekend hebben, handig om een schatting uit te leggen. */
  omgeving: Omgeving;
}

/** Een schatting op een bekende hemelsbrede afstand (bijv. van de kaart). */
export function schatOpAfstand(
  hemelsbreedMeters: number,
  mode: TravelMode,
  omgeving: Omgeving = "gemengd",
): EigenSchatting {
  const distanceMeters = wegMeters(hemelsbreedMeters, mode, omgeving);
  const km = distanceMeters / 1000;
  const minuten = (km / reisSnelheidKmu(km, mode, omgeving)) * 60 + PROFIEL[mode][omgeving].opstapMinuten;
  return {
    mode,
    durationMinutes: Math.max(1, Math.round(minuten)),
    distanceMeters,
    omgeving,
  };
}

/** Een schatting tussen twee punten; de omgeving leiden we zelf af. */
export function schatTussenPunten(van: GeoPoint, naar: GeoPoint, mode: TravelMode): EigenSchatting {
  const omgeving = bepaalOmgeving(van, naar);
  return schatOpAfstand(haversineMeters(van, naar), mode, omgeving);
}

/** Dezelfde rit voor meerdere vervoerswijzen, in de volgorde die je vraagt. */
export function schatAlleWijzen(
  van: GeoPoint,
  naar: GeoPoint,
  modes: TravelMode[],
): EigenSchatting[] {
  const omgeving = bepaalOmgeving(van, naar);
  const meters = haversineMeters(van, naar);
  return modes.map((mode) => schatOpAfstand(meters, mode, omgeving));
}
