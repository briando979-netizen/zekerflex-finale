import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Per-user preferences on the filesystem — the same non-destructive pattern
// as the mailbox and verification tokens. No database, no Redis, no schema.
//   storage/prefs/<userId>.json
//
// The matching engine / dispatcher MAY read this later; for now it only drives
// the frontend (marketplace filters, rate hints, availability, job alerts,
// shift confirmations).
// ---------------------------------------------------------------------------

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

function dir(): string {
  return join(process.cwd(), "storage", "prefs");
}
function path(userId: string): string {
  // userId is a cuid — but guard anyway.
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  return join(dir(), `${safe}.json`);
}

export async function getPrefs(userId: string): Promise<UserPrefs> {
  const p = path(userId);
  if (!existsSync(p)) return { ...EMPTY_PREFS };
  try {
    const raw = JSON.parse(await readFile(p, "utf8")) as Partial<UserPrefs>;
    return { ...EMPTY_PREFS, ...raw, availability: raw.availability ?? {} };
  } catch {
    return { ...EMPTY_PREFS };
  }
}

export async function setPrefs(userId: string, patch: Partial<UserPrefs>): Promise<UserPrefs> {
  await mkdir(dir(), { recursive: true });
  const current = await getPrefs(userId);
  const next: UserPrefs = {
    ...current,
    ...patch,
    availability: patch.availability ?? current.availability,
    jobAlerts: patch.jobAlerts ?? current.jobAlerts,
    confirmations: patch.confirmations ?? current.confirmations,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(path(userId), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function confirmAssignment(userId: string, assignmentId: string): Promise<UserPrefs> {
  const current = await getPrefs(userId);
  return setPrefs(userId, {
    confirmations: { ...current.confirmations, [assignmentId]: new Date().toISOString() },
  });
}
