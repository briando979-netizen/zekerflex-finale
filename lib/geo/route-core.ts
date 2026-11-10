import { haversineMeters } from "@/lib/geo/geofencing";
import { decodePolyline, type LonLat } from "@/lib/geo/polyline";

// ---------------------------------------------------------------------------
// De routeplanner van ZekerFlex, het pure deel: de soorten, de vraag aan onze
// eigen Valhalla-server (deploy/route) en het lezen van zijn antwoord. Geen
// netwerk, geen env, geen database: dit bestand mag ook een client-component
// inlezen (de labels en soorten), en alles is te testen. Het ophalen zelf, met
// cache en terugval, staat in lib/geo/route.ts (alleen server).
// ---------------------------------------------------------------------------

export type RouteModus = "auto" | "fiets" | "lopen";

export const ROUTE_MODI: RouteModus[] = ["auto", "fiets", "lopen"];

export const ROUTE_MODUS_LABEL: Record<RouteModus, string> = {
  auto: "Auto",
  fiets: "Fiets",
  lopen: "Lopen",
};

/** Hoe Valhalla de vervoerswijze noemt ("costing"). */
const COSTING: Record<RouteModus, "auto" | "bicycle" | "pedestrian"> = {
  auto: "auto",
  fiets: "bicycle",
  lopen: "pedestrian",
};

export const isRouteModus = (v: unknown): v is RouteModus => v === "auto" || v === "fiets" || v === "lopen";

export interface RoutePunt {
  lat: number;
  lon: number;
}

export interface RouteStap {
  /** de aanwijzing in gewoon Nederlands, zoals "Sla rechtsaf naar de Damrak." */
  tekst: string;
  meters: number;
  seconds: number;
}

export interface Route {
  meters: number;
  seconds: number;
  /** de lijn over de weg, [lon, lat] zoals GeoJSON */
  lijn: LonLat[];
  /** de afslagen; leeg als er niet om gevraagd is */
  stappen: RouteStap[];
}

/**
 * Het gebied waarvoor onze routeplanner wegen heeft: Nederland met een rand
 * grensstreek (het uittreksel van Geofabrik). Daarbuiten vragen we niets.
 */
export const ROUTE_GEBIED = { minLon: 3.2, minLat: 50.7, maxLon: 7.3, maxLat: 53.6 } as const;

export function binnenRouteGebied(p: RoutePunt): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    p.lon >= ROUTE_GEBIED.minLon &&
    p.lon <= ROUTE_GEBIED.maxLon &&
    p.lat >= ROUTE_GEBIED.minLat &&
    p.lat <= ROUTE_GEBIED.maxLat
  );
}

/** Lopen gaat bij Valhalla tot 100 km route; hemelsbreed houden we wat ruimte over. */
export const MAX_LOPEN_HEMELSBREED_M = 75_000;

export const hemelsbreedMeters = (a: RoutePunt, b: RoutePunt): number =>
  haversineMeters({ latitude: a.lat, longitude: a.lon }, { latitude: b.lat, longitude: b.lon });

/** De vraag aan Valhalla (POST /route). Met `stappen: false` maakt hij geen aanwijzingen: sneller voor de matching. */
export function valhallaVerzoek(van: RoutePunt, naar: RoutePunt, modus: RouteModus, stappen: boolean): Record<string, unknown> {
  return {
    locations: [
      { lat: van.lat, lon: van.lon },
      { lat: naar.lat, lon: naar.lon },
    ],
    costing: COSTING[modus],
    units: "kilometers",
    language: "nl-NL",
    directions_type: stappen ? "instructions" : "none",
  };
}

const getal = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Het antwoord van Valhalla → onze Route. Soepel gelezen: een stap zonder tekst
 * of een been zonder lijn slaan we over; zonder totale lengte en tijd is er geen
 * bruikbare route en komt er null terug.
 */
export function leesValhallaRoute(data: unknown): Route | null {
  const trip = (data as { trip?: unknown } | null)?.trip as
    | { summary?: { length?: unknown; time?: unknown }; legs?: unknown }
    | undefined;
  if (!trip || typeof trip !== "object") return null;
  const km = getal(trip.summary?.length);
  const seconds = getal(trip.summary?.time);
  if (!Number.isFinite(km) || !Number.isFinite(seconds) || km < 0 || seconds < 0) return null;

  const lijn: LonLat[] = [];
  const stappen: RouteStap[] = [];
  const benen = Array.isArray(trip.legs) ? trip.legs : [];
  for (const been of benen) {
    const b = been as { shape?: unknown; maneuvers?: unknown } | null;
    if (!b || typeof b !== "object") continue;
    if (typeof b.shape === "string") {
      const punten = decodePolyline(b.shape, 6);
      // het eerste punt van een volgend been is het laatste van het vorige
      const vorige = lijn[lijn.length - 1];
      const eerste = punten[0];
      lijn.push(...(vorige && eerste && vorige[0] === eerste[0] && vorige[1] === eerste[1] ? punten.slice(1) : punten));
    }
    for (const m of Array.isArray(b.maneuvers) ? b.maneuvers : []) {
      const r = m as { instruction?: unknown; length?: unknown; time?: unknown } | null;
      const tekst = typeof r?.instruction === "string" ? r.instruction.trim() : "";
      if (!tekst) continue;
      const mKm = getal(r?.length);
      const mS = getal(r?.time);
      stappen.push({
        tekst: tekst.slice(0, 300),
        meters: Number.isFinite(mKm) ? Math.round(mKm * 1000) : 0,
        seconds: Number.isFinite(mS) ? Math.round(mS) : 0,
      });
    }
  }
  return { meters: Math.round(km * 1000), seconds: Math.round(seconds), lijn, stappen };
}

/** Een sleutel voor de cache: op ±1 m afgerond, met de vervoerswijze en of er afslagen bij moeten. */
export function routeSleutel(van: RoutePunt, naar: RoutePunt, modus: RouteModus, stappen: boolean): string {
  const r = (n: number) => n.toFixed(5);
  return `${modus}:${stappen ? "s" : "k"}:${r(van.lat)},${r(van.lon)}>${r(naar.lat)},${r(naar.lon)}`;
}

export type RouteVraag =
  | { ok: true; van: RoutePunt; naar: RoutePunt; modus: RouteModus }
  | { ok: false; fout: string };

function leesPunt(v: unknown): RoutePunt | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as { lat?: unknown; lon?: unknown };
  if (typeof r.lat !== "number" || typeof r.lon !== "number") return null;
  if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) return null;
  return { lat: r.lat, lon: r.lon };
}

/**
 * De vraag van de kaart controleren: { van: {lat, lon}, naar: {lat, lon}, modus }.
 * Alleen binnen Nederland, twee verschillende plekken, lopen niet over het halve land.
 */
export function leesRouteVraag(body: unknown): RouteVraag {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const van = leesPunt(b.van);
  const naar = leesPunt(b.naar);
  if (!van || !naar) return { ok: false, fout: "Kies een vertrekpunt en een bestemming." };
  if (!binnenRouteGebied(van) || !binnenRouteGebied(naar)) {
    return { ok: false, fout: "De routeplanner werkt alleen binnen Nederland." };
  }
  const modus = b.modus === undefined ? "auto" : b.modus;
  if (!isRouteModus(modus)) return { ok: false, fout: "Kies auto, fiets of lopen." };
  const afstand = hemelsbreedMeters(van, naar);
  if (afstand < 5) return { ok: false, fout: "Vertrekpunt en bestemming liggen op dezelfde plek." };
  if (modus === "lopen" && afstand > MAX_LOPEN_HEMELSBREED_M) {
    return { ok: false, fout: "Zo ver lopen plant de routeplanner niet. Kies de fiets of de auto." };
  }
  return { ok: true, van, naar, modus };
}
