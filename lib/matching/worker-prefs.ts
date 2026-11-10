import type { Daypart, UserPrefs } from "@/lib/prefs/store";
import { kvGetMany } from "@/lib/storage/kv";
import { amsterdamParts } from "@/lib/time/amsterdam";
import { shiftCategory, type ShiftCategoryKey } from "@/lib/shifts/category";
import { maakBrancheKeuze, standaardFilter } from "@/lib/shifts/branche-keuze";

// ---------------------------------------------------------------------------
// De eigen instellingen van een werker (/dashboard/beschikbaarheid) tellen mee
// in de matching. Het scherm belooft "je krijgt alleen relevante meldingen";
// daarvoor las de engine ze niet. Een werker krijgt geen aanbod voor een dienst
// - onder zijn minimumtarief,
// - op een dagdeel dat hij niet heeft aangevinkt (wie niets aanvinkt, staat voor alles open),
// - verder weg dan zijn maximale reistijd.
// ---------------------------------------------------------------------------

export type WorkerPrefs = Pick<UserPrefs, "availability" | "minHourlyRateCents" | "maxTravelMinutes"> & {
  /** de branches die de werker bij de start koos (lib/worker/branche-store.ts); alleen gezet als het niet "alle" is */
  branches?: ShiftCategoryKey[];
};

/** Same split as the marketplace filter (Dutch hours): before 12, before 17, after. */
export function daypartOfHour(hour: number): Daypart {
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

export function prefsAllowShift(
  prefs: Partial<WorkerPrefs> | null | undefined,
  shift: { startsAt: Date; hourlyRateCents: number; title?: string; skill?: string | null },
): boolean {
  if (!prefs) return true;
  if (prefs.minHourlyRateCents && shift.hourlyRateCents < prefs.minHourlyRateCents) return false;
  // een gekozen branche: geen aanbod uit een andere. "Overig" is geen branche en zegt niets: dat blijft staan.
  if (prefs.branches && prefs.branches.length > 0 && shift.title !== undefined) {
    const k = shiftCategory(shift.title, shift.skill ?? null).key;
    if (k !== "algemeen" && !prefs.branches.includes(k)) return false;
  }
  const avail = prefs.availability ?? {};
  const anySet = Object.values(avail).some((parts) => Array.isArray(parts) && parts.length > 0);
  if (!anySet) return true;
  const p = amsterdamParts(shift.startsAt);
  return (avail[p.weekday] ?? []).includes(daypartOfHour(p.hour));
}

export function prefsAllowTravel(prefs: Partial<WorkerPrefs> | null | undefined, travelMinutes: number): boolean {
  return !prefs?.maxTravelMinutes || travelMinutes <= prefs.maxTravelMinutes;
}

/**
 * All candidates' prefs in one query (lib/prefs/store keys `prefs:<userId>`), met de branches die de
 * werker bij de start koos (`werker-branches:<userId>`; "alle branches" zet niets).
 */
export async function loadWorkerPrefs(userIds: string[]): Promise<Map<string, Partial<WorkerPrefs>>> {
  const rows = await kvGetMany<Partial<WorkerPrefs> | { alle?: unknown; branches?: unknown }>([
    ...userIds.map((id) => `prefs:${id}`),
    ...userIds.map((id) => `werker-branches:${id}`),
  ]);
  return new Map(userIds.flatMap((id) => {
    const p = rows.get(`prefs:${id}`) as Partial<WorkerPrefs> | undefined;
    const keuze = maakBrancheKeuze((rows.get(`werker-branches:${id}`) ?? {}) as { alle?: unknown; branches?: unknown });
    const branches = standaardFilter(keuze);
    if (!p && branches.length === 0) return [];
    return [[id, { ...(p ?? {}), ...(branches.length > 0 ? { branches } : {}) }] as const];
  }));
}
