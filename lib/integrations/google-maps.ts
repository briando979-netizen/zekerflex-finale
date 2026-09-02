import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { GeoPoint } from "@/types/matching";
import type { TravelMode } from "@prisma/client";

const MODE_MAP: Record<TravelMode, string> = {
  DRIVING: "driving",
  TRANSIT: "transit",
  BICYCLING: "bicycling",
  WALKING: "walking",
};

export interface DistanceMatrixLeg {
  mode: TravelMode;
  durationSeconds: number;
  distanceMeters: number;
}

/**
 * Google Maps Distance Matrix lookup for a single origin/destination pair,
 * one request per travel mode. `arrivalTime` (unix seconds) makes transit
 * results schedule-aware. Returns `null` per mode when the route is not
 * resolvable (e.g. no transit at that hour).
 */
export async function fetchDistanceMatrix(
  origin: GeoPoint,
  destination: GeoPoint,
  modes: TravelMode[],
  arrivalTime?: number,
): Promise<Map<TravelMode, DistanceMatrixLeg | null>> {
  const result = new Map<TravelMode, DistanceMatrixLeg | null>();

  if (!env.GOOGLE_MAPS_API_KEY) {
    throw AppError.upstream("GOOGLE_MAPS_API_KEY is not configured");
  }

  const o = `${origin.latitude},${origin.longitude}`;
  const d = `${destination.latitude},${destination.longitude}`;

  await Promise.all(
    modes.map(async (mode) => {
      const url = new URL(
        "https://maps.googleapis.com/maps/api/distancematrix/json",
      );
      url.searchParams.set("origins", o);
      url.searchParams.set("destinations", d);
      url.searchParams.set("mode", MODE_MAP[mode]);
      url.searchParams.set("units", "metric");
      url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY!);
      if (mode === "TRANSIT" && arrivalTime) {
        url.searchParams.set("arrival_time", String(arrivalTime));
      } else if (arrivalTime && mode === "DRIVING") {
        url.searchParams.set("departure_time", "now");
        url.searchParams.set("traffic_model", "best_guess");
      }

      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) {
          logger.warn("distance matrix http error", { mode, status: res.status });
          result.set(mode, null);
          return;
        }
        const json = (await res.json()) as GoogleDistanceMatrixResponse;
        const element = json.rows?.[0]?.elements?.[0];
        if (!element || element.status !== "OK" || !element.duration) {
          result.set(mode, null);
          return;
        }
        result.set(mode, {
          mode,
          durationSeconds:
            element.duration_in_traffic?.value ?? element.duration.value,
          distanceMeters: element.distance?.value ?? 0,
        });
      } catch (err) {
        logger.warn("distance matrix request failed", {
          mode,
          error: (err as Error).message,
        });
        result.set(mode, null);
      }
    }),
  );

  return result;
}

interface GoogleDistanceMatrixResponse {
  rows?: {
    elements?: {
      status: string;
      duration?: { value: number };
      duration_in_traffic?: { value: number };
      distance?: { value: number };
    }[];
  }[];
}
