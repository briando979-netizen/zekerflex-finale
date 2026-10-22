import { Gauge } from "prom-client";
import { metrics } from "@/lib/metrics/registry";
import { logger } from "@/lib/logger";

// Thin, never-throwing recorders. Call sites use these, not prom-client, so a
// metrics failure can never break a business path.

export function recordCronRun(job: string, ok: boolean): void {
  try {
    const m = metrics();
    m.cronLastRun.set({ job }, Date.now() / 1000);
    m.cronLastSuccess.set({ job }, ok ? 1 : 0);
    m.cronRuns.inc({ job, status: ok ? "success" : "error" });
  } catch {
    /* metrics are best-effort */
  }
  // Durable heartbeat (survives serverless invocations) so a job that silently
  // STOPS running can be detected — prom-client gauges above are in-memory only.
  void import("@/lib/ops/heartbeat")
    .then(({ recordCronHeartbeat }) => recordCronHeartbeat(job, ok))
    .catch(() => undefined);
  if (!ok) {
    // tell the owner (push + mail, deduped per job); lazy so this module stays light
    void import("@/lib/ops/alert")
      .then(({ alertOwner }) =>
        alertOwner({ key: `cron:${job}`, title: `Geplande taak mislukt: ${job}`, detail: `De automatische taak "${job}" is mislukt. Details staan in de serverlogs; de volgende run probeert het opnieuw.`, url: "/admin/systeem" }),
      )
      .catch(() => undefined);
  }
}

export function recordLoginFailure(): void {
  try {
    metrics().loginFailures.inc();
  } catch {
    /* noop */
  }
}

export function recordRateLimited(name: string): void {
  try {
    metrics().rateLimited.inc({ name });
  } catch {
    /* noop */
  }
}

export function recordPayout(status: string): void {
  try {
    metrics().payouts.inc({ status: status.toLowerCase() });
  } catch {
    /* noop */
  }
}

export function recordTimesheetApproved(track: string): void {
  try {
    metrics().timesheetsApproved.inc({ track });
  } catch {
    /* noop */
  }
}

export function recordShiftOffer(delivered: boolean): void {
  try {
    metrics().shiftOffers.inc({ delivered: delivered ? "yes" : "no" });
  } catch {
    /* noop */
  }
}

export function recordUserErased(): void {
  try {
    metrics().usersErased.inc();
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Scrape-time gauges — a few cheap COUNT()s refreshed each time /api/metrics is
// hit. Kept small; Prometheus scrapes every 30s.
// ---------------------------------------------------------------------------

let businessGauges: {
  pendingTimesheets: Gauge<string>;
  openShifts: Gauge<string>;
  disabledUsers: Gauge<string>;
} | null = null;

function ensureBusinessGauges() {
  if (businessGauges) return businessGauges;
  const reg = metrics().registry;
  businessGauges = {
    pendingTimesheets: new Gauge({
      name: "zf_timesheets_pending",
      help: "Timesheets awaiting employer approval (SUBMITTED or DISPUTED).",
      registers: [reg],
    }),
    openShifts: new Gauge({
      name: "zf_shifts_open",
      help: "Shifts still taking staff (OPEN/MATCHING/PARTIALLY_FILLED).",
      registers: [reg],
    }),
    disabledUsers: new Gauge({
      name: "zf_users_disabled",
      help: "User accounts with a disabledAt set.",
      registers: [reg],
    }),
  };
  return businessGauges;
}

export async function refreshBusinessGauges(): Promise<void> {
  try {
    const g = ensureBusinessGauges();
    const { prisma } = await import("@/lib/prisma");
    const [pending, open, disabled] = await Promise.all([
      prisma.timesheet.count({ where: { status: { in: ["SUBMITTED", "DISPUTED"] } } }),
      prisma.shift.count({
        where: { status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] } },
      }),
      prisma.user.count({ where: { disabledAt: { not: null } } }),
    ]);
    g.pendingTimesheets.set(pending);
    g.openShifts.set(open);
    g.disabledUsers.set(disabled);
  } catch (err) {
    logger.warn("metrics: business gauge refresh failed", {
      error: (err as Error).message,
    });
  }
}

export async function renderMetrics(): Promise<string> {
  await refreshBusinessGauges();
  return metrics().registry.metrics();
}

export function metricsContentType(): string {
  return metrics().registry.contentType;
}

export interface CronJobStatus {
  job: string;
  /** null = never recorded a run since this process started. */
  lastRunAt: string | null;
  lastRunOk: boolean | null;
}

/** Real last-run/success readout for the background jobs scripts/daemon.mjs drives — for the admin Sim view. */
export async function cronStatusSnapshot(jobs: readonly string[]): Promise<CronJobStatus[]> {
  const m = metrics();
  const [runGauge, successGauge] = await Promise.all([m.cronLastRun.get(), m.cronLastSuccess.get()]);
  const runByJob = new Map(runGauge.values.map((v) => [v.labels.job as string, v.value]));
  const successByJob = new Map(successGauge.values.map((v) => [v.labels.job as string, v.value]));

  return jobs.map((job) => {
    const ts = runByJob.get(job);
    return {
      job,
      lastRunAt: ts ? new Date(ts * 1000).toISOString() : null,
      lastRunOk: successByJob.has(job) ? successByJob.get(job) === 1 : null,
    };
  });
}
