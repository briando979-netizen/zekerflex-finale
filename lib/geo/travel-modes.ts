// Pure, synchronous multi-modal travel heuristic — no DB, Redis or routing API.
// Used to decorate marketplace shift cards with an "auto / OV / fiets / lopen"
// estimate. Mirrors the fallback maths in lib/geo/travel-time.ts so numbers line
// up with the (async, API-backed) matching engine.

export type TravelModeKey = "driving" | "transit" | "bicycling" | "walking";

export interface ModeEstimate {
  mode: TravelModeKey;
  label: string;
  /** door-to-door minutes */
  minutes: number;
  distanceKm: number;
}

const SPEED_KMH: Record<TravelModeKey, number> = {
  driving: 42,
  transit: 24,
  bicycling: 15,
  walking: 4.7,
};

/** Straight-line distance underestimates a real route. */
const DETOUR: Record<TravelModeKey, number> = {
  driving: 1.35,
  transit: 1.6,
  bicycling: 1.25,
  walking: 1.2,
};

/** Fixed overhead: parking, waiting for / walking to a stop, etc. */
const OVERHEAD_MIN: Record<TravelModeKey, number> = {
  driving: 4,
  transit: 12,
  bicycling: 1,
  walking: 0,
};

export const MODE_LABEL: Record<TravelModeKey, string> = {
  driving: "Auto",
  transit: "OV",
  bicycling: "Fiets",
  walking: "Lopen",
};

export const MODE_ORDER: TravelModeKey[] = ["transit", "driving", "bicycling", "walking"];

/** All four modes for a given straight-line (haversine) distance in metres. */
export function travelByMode(straightLineMeters: number): Record<TravelModeKey, ModeEstimate> {
  const out = {} as Record<TravelModeKey, ModeEstimate>;
  for (const mode of MODE_ORDER) {
    const meters = straightLineMeters * DETOUR[mode];
    const minutes = Math.max(1, Math.round((meters / 1000 / SPEED_KMH[mode]) * 60 + OVERHEAD_MIN[mode]));
    out[mode] = {
      mode,
      label: MODE_LABEL[mode],
      minutes,
      distanceKm: Math.round((meters / 1000) * 10) / 10,
    };
  }
  return out;
}

/** The quickest realistic mode (cyclists rarely ride 40 km — cap bike/walk). */
export function fastestMode(byMode: Record<TravelModeKey, ModeEstimate>): ModeEstimate {
  const candidates = MODE_ORDER.map((m) => byMode[m]).filter((e) => {
    if (e.mode === "walking") return e.distanceKm <= 6;
    if (e.mode === "bicycling") return e.distanceKm <= 20;
    return true;
  });
  return candidates.reduce((best, e) => (e.minutes < best.minutes ? e : best), candidates[0]!);
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} u ${m} m` : `${h} u`;
}
