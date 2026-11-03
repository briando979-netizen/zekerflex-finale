import type { Daypart, UserPrefs } from "@/lib/prefs/store";
import { kvGetMany } from "@/lib/storage/kv";
import { amsterdamParts } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// De eigen instellingen van een werker (/dashboard/beschikbaarheid) tellen mee
// in de matching. Het scherm belooft "je krijgt alleen relevante meldingen";
// daarvoor las de engine ze niet. Een werker krijgt geen aanbod voor een dienst
// - onder zijn minimumtarief,
// - op een dagdeel dat hij niet heeft aangevinkt (wie niets aanvinkt, staat voor alles open),
// - verder weg dan zijn maximale reistijd.
// ---------------------------------------------------------------------------

export type WorkerPrefs = Pick<UserPrefs, "availability" | "minHourlyRateCents" | "maxTravelMinutes">;

/** Same split as the marketplace filter (Dutch hours): before 12, before 17, after. */
export function daypartOfHour(hour: number): Daypart {
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

export function prefsAllowShift(
  prefs: Partial<WorkerPrefs> | null | undefined,
  shift: { startsAt: Date; hourlyRateCents: number },
): boolean {
  if (!prefs) return true;
  if (prefs.minHourlyRateCents && shift.hourlyRateCents < prefs.minHourlyRateCents) return false;
  const avail = prefs.availability ?? {};
  const anySet = Object.values(avail).some((parts) => Array.isArray(parts) && parts.length > 0);
  if (!anySet) return true;
  const p = amsterdamParts(shift.startsAt);
  return (avail[p.weekday] ?? []).includes(daypartOfHour(p.hour));
}

export function prefsAllowTravel(prefs: Partial<WorkerPrefs> | null | undefined, travelMinutes: number): boolean {
  return !prefs?.maxTravelMinutes || travelMinutes <= prefs.maxTravelMinutes;
}

/** All candidates' prefs in one query (lib/prefs/store keys `prefs:<userId>`). */
export async function loadWorkerPrefs(userIds: string[]): Promise<Map<string, Partial<WorkerPrefs>>> {
  const rows = await kvGetMany<Partial<WorkerPrefs>>(userIds.map((id) => `prefs:${id}`));
  return new Map(userIds.flatMap((id) => {
    const p = rows.get(`prefs:${id}`);
    return p ? [[id, p] as const] : [];
  }));
}
