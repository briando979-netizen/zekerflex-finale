import { cached, redis } from "@/lib/redis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { gratisAan, primeGratis } from "@/lib/ai/gratis";
import {
  fetchDistanceMatrix,
  type DistanceMatrixLeg,
} from "@/lib/integrations/google-maps";
import { schatAlleWijzen, schatTussenPunten } from "@/lib/geo/eigen-afstand";
import type { GeoPoint, TravelEstimate } from "@/types/matching";
import type { TravelMode } from "@prisma/client";

/**
 * Rekenen we het zelf uit? Ja zodra de knop "alles gratis" aanstaat of er geen
 * Google-sleutel is. Google rekent per opvraging af; onze eigen rekenregel
 * (lib/geo/eigen-afstand.ts) kost niets en stuurt geen adres naar buiten.
 */
function eigenRekenen(): boolean {
  return gratisAan() || !env.GOOGLE_MAPS_API_KEY;
}

/** Onze eigen schatting in de vorm die de matching verwacht. */
function eigenEstimate(
  origin: GeoPoint,
  destination: GeoPoint,
  mode: TravelMode,
): TravelEstimate {
  const s = schatTussenPunten(origin, destination, mode);
  return {
    mode,
    durationMinutes: s.durationMinutes,
    distanceMeters: s.distanceMeters,
    approximate: true,
  };
}

/** Alle gevraagde vervoerswijzen in één keer, zonder netwerk. */
function eigenEstimates(
  origin: GeoPoint,
  destination: GeoPoint,
  modes: TravelMode[],
): TravelEstimate[] {
  return schatAlleWijzen(origin, destination, modes).map((s) => ({
    mode: s.mode,
    durationMinutes: s.durationMinutes,
    distanceMeters: s.distanceMeters,
    approximate: true,
  }));
}

/**
 * Estimate door-to-door travel for each requested mode. Results are cached in
 * Redis keyed by rounded coordinates + arrival hour so a matching run over
 * hundreds of freelancers does not hammer the routing quota.
 *
 * Welke bron: eerst onze eigen rekenregel zodra "alles gratis" aanstaat of er
 * geen Google-sleutel is; anders Google, en valt die weg (storing, quotum, geen
 * route) dan rekenen we het alsnog zelf uit. Er komt dus altijd een schatting
 * terug — de matching mag hier nooit op stilvallen.
 */
export async function estimateTravel(
  origin: GeoPoint,
  destination: GeoPoint,
  modes: TravelMode[],
  arrivalAt: Date,
): Promise<TravelEstimate[]> {
  const round = (n: number) => Math.round(n * 1000) / 1000; // ~110m grid
  const hourBucket = new Date(arrivalAt);
  hourBucket.setMinutes(0, 0, 0);
  const key = `travel:v1:${round(origin.latitude)},${round(origin.longitude)}->${round(
    destination.latitude,
  )},${round(destination.longitude)}:${hourBucket.toISOString()}:${modes.sort().join(",")}`;

  return cached(key, 900, async () => {
    // De stand van "alles gratis" staat in KV, met een cache van een minuut.
    await primeGratis();
    if (eigenRekenen()) {
      void recordRoutingOutcome("eigen");
      return eigenEstimates(origin, destination, modes);
    }

    let matrix: Map<TravelMode, DistanceMatrixLeg | null>;
    try {
      matrix = await fetchDistanceMatrix(
        origin,
        destination,
        modes,
        Math.floor(arrivalAt.getTime() / 1000),
      );
    } catch (err) {
      logger.warn("travel routing unavailable, using heuristic", {
        error: (err as Error).message,
      });
      void recordRoutingOutcome("fallback");
      return eigenEstimates(origin, destination, modes);
    }

    void recordRoutingOutcome("live");
    return modes.map((mode) => {
      const leg = matrix.get(mode);
      if (!leg) return eigenEstimate(origin, destination, mode);
      return {
        mode,
        durationMinutes: Math.round(leg.durationSeconds / 60),
        distanceMeters: leg.distanceMeters,
        approximate: false,
      };
    });
  });
}

const ROUTING_STAT_TTL_SECONDS = 60 * 60 * 24;
const ROUTING_STAT_LIVE_KEY = "zf:travel:stat:live";
const ROUTING_STAT_FALLBACK_KEY = "zf:travel:stat:fallback";
const ROUTING_STAT_EIGEN_KEY = "zf:travel:stat:eigen";

/** Welke bron de schatting gaf: Google werkte, Google faalde, of we rekenden
 * zelf omdat dat zo ingesteld staat. */
export type RoutingOutcome = "live" | "fallback" | "eigen";

const ROUTING_STAT_KEY: Record<RoutingOutcome, string> = {
  live: ROUTING_STAT_LIVE_KEY,
  fallback: ROUTING_STAT_FALLBACK_KEY,
  eigen: ROUTING_STAT_EIGEN_KEY,
};

/** Track live-Google-API vs heuristic-fallback outcomes so the orchestration
 * loop and admin console can see how sovereign the routing actually is. */
async function recordRoutingOutcome(outcome: RoutingOutcome): Promise<void> {
  const key = ROUTING_STAT_KEY[outcome];
  try {
    await redis.incr(key);
    await redis.expire(key, ROUTING_STAT_TTL_SECONDS);
  } catch {
    /* best-effort telemetry only */
  }
}

export interface TravelRoutingStats {
  live: number;
  fallback: number;
  /** Zelf gerekend omdat het zo ingesteld staat (geen storing). */
  eigen: number;
  /** Alleen over de ritten waarvoor Google gevraagd is: hoe gezond die kant is. */
  fallbackRatePct: number;
}

/** Rolling ~24h count of routing decisions, reset whenever both counters expire. */
export async function getTravelRoutingStats(): Promise<TravelRoutingStats> {
  const [liveRaw, fallbackRaw, eigenRaw] = await Promise.all([
    redis.get(ROUTING_STAT_LIVE_KEY),
    redis.get(ROUTING_STAT_FALLBACK_KEY),
    redis.get(ROUTING_STAT_EIGEN_KEY),
  ]);
  const live = Number(liveRaw ?? "0") || 0;
  const fallback = Number(fallbackRaw ?? "0") || 0;
  const eigen = Number(eigenRaw ?? "0") || 0;
  const total = live + fallback;
  return {
    live,
    fallback,
    eigen,
    fallbackRatePct: total === 0 ? 0 : Math.round((fallback / total) * 1000) / 10,
  };
}

/** The fastest estimate across all evaluated modes. */
export function fastestMode(estimates: TravelEstimate[]): TravelEstimate {
  return estimates.reduce((best, e) =>
    e.durationMinutes < best.durationMinutes ? e : best,
  );
}
