import { cached } from "@/lib/redis";
import { logger } from "@/lib/logger";
import {
  fetchDistanceMatrix,
  type DistanceMatrixLeg,
} from "@/lib/integrations/google-maps";
import { haversineMeters } from "@/lib/geo/geofencing";
import type { GeoPoint, TravelEstimate } from "@/types/matching";
import type { TravelMode } from "@prisma/client";

/** Rough average speeds (km/h) for the heuristic fallback. */
const FALLBACK_SPEED_KMH: Record<TravelMode, number> = {
  DRIVING: 42,
  TRANSIT: 24,
  BICYCLING: 15,
  WALKING: 4.7,
};

/** Detour factor: straight-line distance underestimates real routes. */
const DETOUR_FACTOR: Record<TravelMode, number> = {
  DRIVING: 1.35,
  TRANSIT: 1.6,
  BICYCLING: 1.25,
  WALKING: 1.2,
};

function heuristicEstimate(
  origin: GeoPoint,
  destination: GeoPoint,
  mode: TravelMode,
): TravelEstimate {
  const straight = haversineMeters(origin, destination);
  const distanceMeters = Math.round(straight * DETOUR_FACTOR[mode]);
  const hours = distanceMeters / 1000 / FALLBACK_SPEED_KMH[mode];
  // Add fixed overhead for transit (waiting, walking to stop).
  const overheadMin = mode === "TRANSIT" ? 12 : mode === "DRIVING" ? 3 : 0;
  return {
    mode,
    durationMinutes: Math.round(hours * 60 + overheadMin),
    distanceMeters,
    approximate: true,
  };
}

/**
 * Estimate door-to-door travel for each requested mode, preferring the live
 * routing API and falling back to a speed heuristic when it is unavailable.
 * Results are cached in Redis keyed by rounded coordinates + arrival hour so a
 * matching run over hundreds of freelancers does not hammer the routing quota.
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
      return modes.map((m) => heuristicEstimate(origin, destination, m));
    }

    return modes.map((mode) => {
      const leg = matrix.get(mode);
      if (!leg) return heuristicEstimate(origin, destination, mode);
      return {
        mode,
        durationMinutes: Math.round(leg.durationSeconds / 60),
        distanceMeters: leg.distanceMeters,
        approximate: false,
      };
    });
  });
}

/** The fastest estimate across all evaluated modes. */
export function fastestMode(estimates: TravelEstimate[]): TravelEstimate {
  return estimates.reduce((best, e) =>
    e.durationMinutes < best.durationMinutes ? e : best,
  );
}
