import { ensureAiNode } from "@/lib/ai/client";
import { logger } from "@/lib/logger";
import { acquireLock } from "@/lib/redis";
import { ACTIONS, type AutopilotAction } from "@/lib/autopilot/actions";
import { getSettings, log } from "@/lib/autopilot/store";

// ---------------------------------------------------------------------------
// Autopilot runner — the AI that keeps ZekerFlex moving by itself.
// Runs every action that is switched on, one after the other, each in its own
// try/catch so one failure never stops the rest. Every run is written to the
// live log (Admin → Autopilot). Triggered by cron (morning + evening) and the
// "Nu draaien" button.
// ---------------------------------------------------------------------------

export interface RunReport {
  ran: { key: string; ok: boolean; count: number; summary: string; ms: number }[];
  skipped: string[];
}

export async function runAutopilot(trigger: "cron" | "handmatig", only?: string[]): Promise<RunReport> {
  await ensureAiNode();
  const settings = await getSettings();
  const report: RunReport = { ran: [], skipped: [] };
  if (!settings.enabled && trigger === "cron") {
    report.skipped = ACTIONS.map((a) => a.key);
    return report;
  }
  const unlock = await acquireLock("autopilot:run", 240_000).catch(() => null);
  if (!unlock) {
    report.skipped = ACTIONS.map((a) => a.key);
    return report;
  }
  try {
    const now = new Date();
    for (const a of ACTIONS as AutopilotAction[]) {
      if ((only && !only.includes(a.key)) || settings.disabled.includes(a.key)) {
        report.skipped.push(a.key);
        continue;
      }
      const t = Date.now();
      try {
        const r = await a.run(now);
        report.ran.push({ key: a.key, ok: true, count: r.count, summary: r.summary, ms: Date.now() - t });
        await log({ at: new Date().toISOString(), action: a.key, ok: true, count: r.count, summary: r.summary, ...(r.details?.length ? { details: r.details } : {}), trigger });
      } catch (err) {
        const msg = (err as Error).message.slice(0, 200);
        logger.error("autopilot action failed", { action: a.key, error: msg });
        report.ran.push({ key: a.key, ok: false, count: 0, summary: msg, ms: Date.now() - t });
        await log({ at: new Date().toISOString(), action: a.key, ok: false, count: 0, summary: msg, trigger });
      }
    }
  } finally {
    await unlock();
  }
  return report;
}
