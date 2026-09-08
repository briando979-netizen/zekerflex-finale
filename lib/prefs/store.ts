import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Per-user preferences. Postgres-backed (KeyValueStore, key "prefs:<userId>")
// — was local disk, unreliable on Vercel's serverless functions.
//
// The matching engine / dispatcher MAY read this later; for now it only drives
// the frontend (marketplace filters, rate hints, availability, job alerts,
// shift confirmations).
// ---------------------------------------------------------------------------

const key = (userId: string) => `prefs:${userId}`;

export type Daypart = "morning" | "afternoon" | "evening";

export interface JobAlert {
  id: string;
  label: string;
  skill?: string | undefined;
  minRateCents?: number | undefined;
  maxTravelMinutes?: number | undefined;
  city?: string | undefined;
  createdAt: string;
}

export interface UserPrefs {
  /** weekday (0 = Sunday … 6 = Saturday) -> available dayparts */
  availability: Partial<Record<number, Daypart[]>>;
  minHourlyRateCents: number | null;
  desiredHourlyRateCents: number | null;
  maxTravelMinutes: number | null;
  standby: boolean;
  jobAlerts: JobAlert[];
  /** assignmentId -> ISO timestamp the freelancer confirmed attendance */
  confirmations: Record<string, string>;
  /** last time the marketplace was opened, for "new since your last visit" */
  marketplaceSeenAt: string | null;
  updatedAt: string;
}

export const EMPTY_PREFS: UserPrefs = {
  availability: {},
  minHourlyRateCents: null,
  desiredHourlyRateCents: null,
  maxTravelMinutes: null,
  standby: false,
  jobAlerts: [],
  confirmations: {},
  marketplaceSeenAt: null,
  updatedAt: new Date(0).toISOString(),
};

export async function getPrefs(userId: string): Promise<UserPrefs> {
  const raw = await kvGet<Partial<UserPrefs>>(key(userId));
  if (!raw) return { ...EMPTY_PREFS };
  return { ...EMPTY_PREFS, ...raw, availability: raw.availability ?? {} };
}

export async function setPrefs(userId: string, patch: Partial<UserPrefs>): Promise<UserPrefs> {
  const current = await getPrefs(userId);
  const next: UserPrefs = {
    ...current,
    ...patch,
    availability: patch.availability ?? current.availability,
    jobAlerts: patch.jobAlerts ?? current.jobAlerts,
    confirmations: patch.confirmations ?? current.confirmations,
    updatedAt: new Date().toISOString(),
  };
  await kvSet(key(userId), next);
  return next;
}

export async function confirmAssignment(userId: string, assignmentId: string): Promise<UserPrefs> {
  const current = await getPrefs(userId);
  return setPrefs(userId, {
    confirmations: { ...current.confirmations, [assignmentId]: new Date().toISOString() },
  });
}
