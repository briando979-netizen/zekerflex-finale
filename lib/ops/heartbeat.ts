import { kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { alertOwner } from "@/lib/ops/alert";

// ---------------------------------------------------------------------------
// Cron heartbeat + missing-job watchdog.
//
// recordCronRun() alerts when a job RUNS and fails. It can't catch a job that
// silently STOPS running (e.g. Vercel crons 401'ing after a secret change) —
// and the prom-client "last run" gauge lives in process memory, so on
// serverless it doesn't survive between invocations. This module writes a
// DURABLE heartbeat per job to the KeyValueStore on every successful run, and
// checkCronHeartbeats() alerts the owner when a job hasn't run within its
// expected window. Runs on Vercel, so it catches partial failures (a dead
// cron, DB/Redis gone); a full Vercel outage is covered by deploy/DISASTER-
// RECOVERY.md and the external laptop ping.
// ---------------------------------------------------------------------------

export interface WatchedCron {
  job: string; // must equal the name passed to recordCronRun(...)
  label: string;
  /** stale after this many hours without a successful run */
  maxAgeHours: number;
}

// Only the jobs actually scheduled in vercel.json on the live deployment.
// Daily jobs get a 26h window (24h + buffer); autopilot runs twice daily.
export const WATCHED_CRONS: WatchedCron[] = [
  { job: "matching-tick", label: "Matching", maxAgeHours: 26 },
  { job: "active-hours", label: "Actieve uren herberekenen", maxAgeHours: 26 },
  { job: "orchestration", label: "Orchestratie", maxAgeHours: 26 },
  { job: "rag-reindex", label: "RAG opnieuw indexeren", maxAgeHours: 26 },
  { job: "sales-motor", label: "Sales-motor", maxAgeHours: 26 },
  { job: "ai-watchdog", label: "AI-watchdog", maxAgeHours: 26 },
  { job: "abu-phase-sweep", label: "ABU-fasen", maxAgeHours: 26 },
  { job: "claim-collections-sweep", label: "Incasso & herinneringen", maxAgeHours: 26 },
  { job: "agenda-mail-sweep", label: "Agenda-mail", maxAgeHours: 26 },
  { job: "bank-monthly-fees", label: "Bankkosten", maxAgeHours: 26 },
  { job: "worker-push-sweep", label: "Meldingen werknemers", maxAgeHours: 26 },
  { job: "autopilot", label: "Autopilot", maxAgeHours: 26 },
  { job: "pensioen-aangifte", label: "StiPP-pensioenaangifte", maxAgeHours: 24 * 35 },
];

interface Beat {
  at: string;
  ok: boolean;
}

const beatKey = (job: string) => `cron-heartbeat:${job}`;
const BOOT_KEY = "cron-heartbeat:first-seen";
/** don't alert about a never-seen job until the deployment has existed this long */
const GRACE_MS = 48 * 60 * 60 * 1000;

/** Record that a job ran. Never throws; call fire-and-forget. */
export async function recordCronHeartbeat(job: string, ok: boolean): Promise<void> {
  try {
    await kvSet(beatKey(job), { at: new Date().toISOString(), ok } satisfies Beat);
    if (!(await kvGet<{ at: string }>(BOOT_KEY))) await kvSet(BOOT_KEY, { at: new Date().toISOString() });
  } catch (err) {
    logger.warn("cron heartbeat write failed", { job, error: (err as Error).message });
  }
}

export interface CronHealth {
  job: string;
  label: string;
  lastRunAt: string | null;
  lastRunOk: boolean | null;
  stale: boolean;
  maxAgeHours: number;
}

async function firstSeenMs(): Promise<number> {
  const boot = await kvGet<{ at: string }>(BOOT_KEY).catch(() => null);
  return boot ? new Date(boot.at).getTime() : Date.now();
}

export async function cronHeartbeats(now = Date.now()): Promise<CronHealth[]> {
  const boot = await firstSeenMs();
  const deploymentOldEnough = now - boot > GRACE_MS;
  return Promise.all(
    WATCHED_CRONS.map(async (c) => {
      const beat = await kvGet<Beat>(beatKey(c.job)).catch(() => null);
      const lastMs = beat ? new Date(beat.at).getTime() : null;
      const stale = lastMs !== null ? now - lastMs > c.maxAgeHours * 3_600_000 : deploymentOldEnough;
      return { job: c.job, label: c.label, lastRunAt: beat?.at ?? null, lastRunOk: beat?.ok ?? null, stale, maxAgeHours: c.maxAgeHours };
    }),
  );
}

/** Check every watched job; alert the owner once per stale job (deduped in alertOwner). */
export async function checkCronHeartbeats(now = Date.now()): Promise<{ stale: string[] }> {
  const health = await cronHeartbeats(now);
  const stale = health.filter((h) => h.stale);
  for (const h of stale) {
    const when = h.lastRunAt ? `laatst gedraaid ${new Date(h.lastRunAt).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}` : "nog nooit gezien";
    await alertOwner({
      key: `cron-missing:${h.job}`,
      title: `Geplande taak draait niet: ${h.label}`,
      detail: `"${h.job}" had binnen ${h.maxAgeHours} uur moeten draaien (${when}). Controleer de Vercel-crons (CRON_SECRET) of de scheduler.`,
      severity: "critical",
      url: "/admin/systeem",
    });
  }
  return { stale: stale.map((h) => h.job) };
}
