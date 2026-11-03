import { afstand, lijnLengte, type Punt } from "@/lib/kaart/geo";

// ---------------------------------------------------------------------------
// Lesroute: de gereden route van een rijles, opgenomen met de telefoon van de
// instructeur en na de les te zien voor de leerling. Het is een locatiespoor,
// dus bewust grof en kort bewaard (lib/privacy/retention.ts, 2 jaar):
// - alleen punten in Nederland en binnen de lestijd;
// - uitgedund: minstens 5 s én 10 m na het vorige punt;
// - afgerond op 4 decimalen (±10 m);
// - hoogstens 3000 punten per les.
// Puur, zodat het te testen is.
// ---------------------------------------------------------------------------

/** [lengte, breedte, unix-seconden] */
export type RoutePunt = [number, number, number];

export interface OpgeslagenRoute {
  v: 1;
  punten: RoutePunt[];
}

const MAX_PUNTEN = 3000;
const MIN_SEC = 5;
const MIN_M = 10;
const NL = { minLon: 3.0, maxLon: 7.4, minLat: 50.6, maxLat: 53.7 };
const rond = (g: number) => Math.round(g * 1e4) / 1e4;

export function leesRoute(json: unknown): RoutePunt[] {
  const p = (json as { punten?: unknown })?.punten;
  if (!Array.isArray(p)) return [];
  return p.filter((x): x is RoutePunt => Array.isArray(x) && x.length === 3 && x.every((n) => typeof n === "number" && Number.isFinite(n)));
}

/**
 * Voegt nieuwe punten toe aan de bestaande route van een les. `les` begrenst
 * de tijd: een kwartier vóór de geplande start tot een uur na het einde.
 */
export function voegRouteToe(bestaand: RoutePunt[], nieuw: RoutePunt[], les: { start: Date; eind: Date }): OpgeslagenRoute {
  const van = Math.floor(les.start.getTime() / 1000) - 15 * 60;
  const tot = Math.floor(les.eind.getTime() / 1000) + 60 * 60;
  const route = [...bestaand];
  const kandidaten = nieuw
    .filter(([lon, lat, t]) => Number.isFinite(lon) && Number.isFinite(lat) && Number.isFinite(t))
    .filter(([lon, lat, t]) => lon >= NL.minLon && lon <= NL.maxLon && lat >= NL.minLat && lat <= NL.maxLat && t >= van && t <= tot)
    .map(([lon, lat, t]): RoutePunt => [rond(lon), rond(lat), Math.round(t)])
    .sort((a, b) => a[2] - b[2]);
  for (const p of kandidaten) {
    if (route.length >= MAX_PUNTEN) break;
    const vorige = route[route.length - 1];
    if (vorige) {
      if (p[2] - vorige[2] < MIN_SEC) continue;
      if (afstand([vorige[0], vorige[1]], [p[0], p[1]]) < MIN_M) continue;
    }
    route.push(p);
  }
  return { v: 1, punten: route };
}

export interface RouteWeergave {
  punten: Punt[];
  meters: number;
  seconden: number;
}

/** Wat de leerling te zien krijgt: de lijn, de afstand en de duur. Geen route = null. */
export function routeWeergave(json: unknown): RouteWeergave | null {
  const r = leesRoute(json);
  if (r.length < 2) return null;
  const punten = r.map(([lon, lat]): Punt => [lon, lat]);
  return { punten, meters: Math.round(lijnLengte(punten)), seconden: r[r.length - 1]![2] - r[0]![2] };
}
