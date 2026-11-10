import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  leesValhallaRoute,
  routeSleutel,
  valhallaVerzoek,
  type Route,
  type RouteModus,
  type RoutePunt,
} from "@/lib/geo/route-core";

// ---------------------------------------------------------------------------
// Onze eigen routeplanner: Valhalla op de VPS (dienst "routes" in
// docker-compose.vps.yml, gegevens via deploy/route/haal-route.sh), met
// OpenStreetMap-wegen van Nederland. Kost niets per route en er gaat geen adres
// naar buiten (lib/gratis/diensten.ts, post "routeplanner").
//
// Hij is er niet altijd: de tegels zijn nog niet gebouwd, de dienst herstart,
// of ROUTE_BASE_URL staat niet (lokaal). Dan geeft planRoute() null en rekent
// de aanroeper met onze eigen schatting (lib/geo/eigen-afstand.ts); er gaat
// nooit een fout naar de gebruiker. Zodat de matching (honderden werkers tegelijk)
// de dienst niet overspoelt of op time-outs blijft wachten:
//   - een cache in het geheugen (globalThis: Next bundelt routes apart), 30 min;
//   - hoogstens een paar verzoeken tegelijk, de rest wacht even;
//   - na een storing een minuut niet meer proberen.
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 3_000;
const STATUS_TIMEOUT_MS = 1_500;
const CACHE_MS = 30 * 60_000;
/** "geen route mogelijk" korter onthouden: misschien lag een punt net naast de weg */
const GEEN_ROUTE_MS = 5 * 60_000;
const CACHE_MAX = 1_000;
const STORING_MS = 60_000;
const STATUS_MS = 60_000;
const TEGELIJK = 4;

export type RouteUitkomst =
  | { soort: "route"; route: Route }
  /** de dienst antwoordde, maar er is tussen deze punten geen weg (bijv. midden in het water) */
  | { soort: "geen" }
  /** de dienst is er niet of antwoordde niet op tijd */
  | { soort: "storing" };

interface Staat {
  cache: Map<string, { tot: number; uitkomst: RouteUitkomst }>;
  storingTot: number;
  status: { tot: number; aan: boolean } | null;
  bezig: number;
  wachtrij: (() => void)[];
}

function staat(): Staat {
  const g = globalThis as typeof globalThis & { __zfRoute?: Staat };
  g.__zfRoute ??= { cache: new Map(), storingTot: 0, status: null, bezig: 0, wachtrij: [] };
  return g.__zfRoute;
}

const basis = (): string | null => {
  const url = env.ROUTE_BASE_URL;
  return url ? url.replace(/\/+$/, "") : null;
};

/** Staat de routeplanner ingesteld en is hij niet net uitgevallen? (Zonder netwerk; voor een snelle keuze.) */
export function routeAan(nu = Date.now()): boolean {
  return basis() !== null && staat().storingTot <= nu;
}

async function plek(): Promise<void> {
  const s = staat();
  if (s.bezig < TEGELIJK) {
    s.bezig += 1;
    return;
  }
  await new Promise<void>((klaar) => s.wachtrij.push(klaar));
}

function vrij(): void {
  const s = staat();
  const volgende = s.wachtrij.shift();
  // de plek gaat meteen door naar wie wacht; anders komt hij vrij
  if (volgende) volgende();
  else s.bezig = Math.max(0, s.bezig - 1);
}

function onthoud(sleutel: string, uitkomst: RouteUitkomst, ms: number): void {
  const cache = staat().cache;
  if (cache.size >= CACHE_MAX) {
    // de oudste eruit (een Map houdt de volgorde van toevoegen aan)
    const oudste = cache.keys().next().value;
    if (oudste !== undefined) cache.delete(oudste);
  }
  cache.set(sleutel, { tot: Date.now() + ms, uitkomst });
}

/** Alleen de host: een adres met coördinaten of tokens hoort niet in een log. */
const hostVan = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return "onbekend";
  }
};

/**
 * Vraag een route. Onderscheidt "er is geen weg" van "de dienst is er niet",
 * zodat de kaart het juiste kan zeggen; gooit nooit.
 */
export async function vraagRoute(
  van: RoutePunt,
  naar: RoutePunt,
  modus: RouteModus,
  opties: { stappen?: boolean } = {},
): Promise<RouteUitkomst> {
  const url = basis();
  if (!url) return { soort: "storing" };
  const stappen = opties.stappen ?? true;
  const sleutel = routeSleutel(van, naar, modus, stappen);
  const s = staat();
  const bewaard = s.cache.get(sleutel);
  if (bewaard && bewaard.tot > Date.now()) return bewaard.uitkomst;
  if (s.storingTot > Date.now()) return { soort: "storing" };

  await plek();
  try {
    // terwijl we wachtten kan de dienst uitgevallen zijn: dan niet ook nog eens 3 s wachten
    if (staat().storingTot > Date.now()) return { soort: "storing" };
    const res = await fetch(`${url}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(valhallaVerzoek(van, naar, modus, stappen)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 400) {
      // Valhalla zegt 400 als er geen weg is ("No path could be found") of de rit te lang is
      await res.body?.cancel().catch(() => undefined);
      const uitkomst: RouteUitkomst = { soort: "geen" };
      onthoud(sleutel, uitkomst, GEEN_ROUTE_MS);
      return uitkomst;
    }
    if (!res.ok) throw new Error(`routeplanner antwoordde ${res.status}`);
    const route = leesValhallaRoute(await res.json());
    if (!route) throw new Error("routeplanner gaf een onleesbaar antwoord");
    const uitkomst: RouteUitkomst = { soort: "route", route };
    onthoud(sleutel, uitkomst, CACHE_MS);
    return uitkomst;
  } catch (err) {
    const st = staat();
    // één melding per storing, niet één per werker in de matching
    if (st.storingTot <= Date.now()) {
      logger.warn("routeplanner niet bereikbaar, de schatting wordt gebruikt", {
        host: hostVan(url),
        reason: err instanceof Error ? err.message : String(err),
      });
    }
    st.storingTot = Date.now() + STORING_MS;
    st.status = { tot: Date.now() + STORING_MS, aan: false };
    return { soort: "storing" };
  } finally {
    vrij();
  }
}

/**
 * Een route, of null als die er niet is (geen weg, of de dienst is er niet).
 * De aanroeper valt dan terug op onze eigen schatting.
 */
export async function planRoute(
  van: RoutePunt,
  naar: RoutePunt,
  modus: RouteModus,
  opties: { stappen?: boolean } = {},
): Promise<Route | null> {
  const uitkomst = await vraagRoute(van, naar, modus, opties);
  return uitkomst.soort === "route" ? uitkomst.route : null;
}

/** Draait de routeplanner? Een korte vraag naar /status, een minuut onthouden (voor de kaart). */
export async function routeStatus(): Promise<boolean> {
  const url = basis();
  if (!url) return false;
  const s = staat();
  if (s.status && s.status.tot > Date.now()) return s.status.aan;
  let aan = false;
  try {
    const res = await fetch(`${url}/status`, { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
    await res.body?.cancel().catch(() => undefined);
    aan = res.ok;
  } catch {
    aan = false;
  }
  s.status = { tot: Date.now() + STATUS_MS, aan };
  if (aan) s.storingTot = 0;
  return aan;
}
