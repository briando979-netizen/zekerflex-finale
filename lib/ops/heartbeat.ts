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
  // alleen zelf-gehost: backup-dienst in docker-compose.vps.yml + /api/internal/backup/check
  { job: "db-backup", label: "Database-back-up", maxAgeHours: 26 },
  // elke zondag na de back-up (deploy/backup/entrypoint.sh, run_verify), gemeld door /api/internal/backup/check
  { job: "db-backup-verify", label: "Back-up: diepgaande hersteltest", maxAgeHours: 24 * 8 + 2 },
  { job: "site-uptime", label: "Uptime-bewaking klantsites", maxAgeHours: 2 },
  { job: "site-weekly-check", label: "Wekelijkse check klantsites", maxAgeHours: 24 * 8 },
  { job: "site-backups", label: "Back-ups klantsites", maxAgeHours: 26 },
  { job: "website-check-opruimen", label: "Verlopen voorbeeldsites van de website-check opruimen", maxAgeHours: 26 },
  { job: "sitechat-opruimen", label: "Websitechats na 90 dagen stilte wissen", maxAgeHours: 26 },
  { job: "rijschool-herinneringen", label: "Rijschool: lesherinneringen", maxAgeHours: 26 },
  // elke 30 min (draait ook als de automatische reparaties uit staan; dan doet hij niets)
  { job: "bouwer-auto", label: "Bouwer: automatische reparaties", maxAgeHours: 2 },
  // elke 2 min: pushmeldingen over de Bouwer en het live zetten
  { job: "bouwer-meldingen", label: "Bouwer: meldingen", maxAgeHours: 2 },
  // elke 10 min: de nieuwste main alvast controleren vóór het live zetten (lib/bouwer/controles.ts)
  { job: "controles-tick", label: "Controle van main (TypeScript, eslint, tests)", maxAgeHours: 2 },
  // elk kwartier: de productlijst voor AI-assistenten bij Stripe (lib/shop/agent-handel-server.ts)
  { job: "agent-catalogus", label: "Verkoop via AI: productlijst bij Stripe", maxAgeHours: 2 },
  // elke 10 min: AI-opdrachten van de video-editor op de achtergrond (lib/video/wachtrij.ts)
  { job: "video-wachtrij", label: "Video-editor: wachtrij op de achtergrond", maxAgeHours: 2 },
  // dagelijks 10:00 UTC (/api/internal/worker/milestones): profielcijfers + mijlpalen van werkers
  { job: "worker-stats", label: "Werkers: profielcijfers", maxAgeHours: 26 },
  { job: "worker-milestones", label: "Werkers: mijlpalen en seintjes", maxAgeHours: 26 },
  // elk uur: Metabase ingericht houden (lib/bi/metabase.ts)
  { job: "bi-setup", label: "Rapportages (Metabase) ingericht", maxAgeHours: 3 },
  // elk uur: bronnen van buiten (lib/bronnen/tick.ts)
  { job: "bronnen", label: "Bronnen van buiten (pompprijzen, minimumloon, cao, KVK, schermcontrole)", maxAgeHours: 3 },
  // dagelijks 11:00 UTC: nieuwe pagina's melden bij Bing/IndexNow
  { job: "indexnow", label: "IndexNow (zoekmachines)", maxAgeHours: 26 },
  // 08, 12 en 16 UTC: offerte-aanvragen in sales@/info@ herkennen
  { job: "sales-offers", label: "Offerte-AI (mailbox)", maxAgeHours: 26 },
  // dagelijks 07:00 UTC: dagoverzicht van de gratis scans aan sales@ (alleen een mail als er iets gebeurde)
  { job: "scan-dagoverzicht", label: "Scans & deals: dagoverzicht aan sales", maxAgeHours: 26 },
  // dagelijks 04:20 UTC: elke openbare pagina ophalen; kapotte pagina's naar het foutenlogboek (lib/ops/rondgang.ts)
  { job: "rondgang", label: "Rondgang langs alle openbare pagina's", maxAgeHours: 26 },
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
