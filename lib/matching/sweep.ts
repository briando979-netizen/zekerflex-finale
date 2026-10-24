import { kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { recordCronHeartbeat } from "@/lib/ops/heartbeat";
import { processMatchingFollowups } from "@/lib/notifications/dispatcher";

// ---------------------------------------------------------------------------
// Opportunistische matching-opvolging. De Vercel-cron draait matching-tick maar
// 1×/dag (en mist soms een run — vandaar de watchdog-melding). Deze sweep draait
// processMatchingFollowups() óók vanuit druk-bezochte endpoints, max. 1× per
// paar minuten (KV-throttle), zodat een gemiste cron de matching niet stillegt.
// Schrijft de cron-heartbeat, dus de watchdog ziet 'm als 'gedraaid'.
// ---------------------------------------------------------------------------

const KEY = "matching-sweep:last";
const INTERVAL_MS = 4 * 60_000;

export async function maybeRunMatchingFollowups(): Promise<void> {
  try {
    const last = await kvGet<string>(KEY).catch(() => null);
    if (last && Date.now() - new Date(last).getTime() < INTERVAL_MS) return;
    await kvSet(KEY, new Date().toISOString()); // claim de slot vóór het draaien
  } catch {
    return; // KV niet beschikbaar — sla deze keer over
  }
  try {
    await processMatchingFollowups();
    await recordCronHeartbeat("matching-tick", true);
  } catch (err) {
    logger.warn("opportunistic matching followups failed", { error: (err as Error).message });
  }
}
