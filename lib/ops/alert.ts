import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Owner alerts: when something breaks (a scheduled job, a payout, a money
// check, the Stripe webhook), every platform admin gets a push notification on
// their phone and an e-mail goes to MAIL_ADMIN. The same problem is reported
// at most once per hour (critical) or per six hours (warning), so a failing
// job doesn't flood anyone. Never throws — alerting must not break the caller.
// ---------------------------------------------------------------------------

export type AlertSeverity = "critical" | "warning";

export interface OpsAlert {
  key: string; // dedupe key, e.g. "cron:sepa-batch" or "payout:pay_123"
  title: string;
  detail: string;
  severity?: AlertSeverity;
  url?: string; // where to look, e.g. "/admin/bank"
}

export interface LoggedAlert {
  key: string;
  title: string;
  detail: string;
  severity: AlertSeverity;
  url: string;
  at: string;
  sent: { push: number; mail: boolean; webhook: boolean };
}

// Stuurt het alert ook naar een inkomende-webhook (Discord/Slack/Mattermost/
// generiek). Discord leest `content`, Slack leest `text` — we sturen beide, dus
// het werkt met de meeste ontvangers. Faalt stil (alerting mag nooit breken).
export async function postOpsWebhook(url: string | undefined, text: string): Promise<boolean> {
  const target = (url ?? "").trim();
  if (!target) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, text }),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const LOG_KEY = "ops-alerts:log";
const QUIET_MS: Record<AlertSeverity, number> = { critical: 60 * 60_000, warning: 6 * 60 * 60_000 };

export async function alertOwner(alert: OpsAlert, now = Date.now()): Promise<"sent" | "deduped" | "failed"> {
  const severity = alert.severity ?? "critical";
  const url = alert.url ?? "/admin/systeem";
  try {
    const last = await kvGet<{ at: number }>(`ops-alert:${alert.key}`);
    if (last && now - last.at < QUIET_MS[severity]) return "deduped";
    await kvSet(`ops-alert:${alert.key}`, { at: now });

    const [{ platformAdminIds }, { sendUserPush }, { sendMail }] = await Promise.all([
      import("@/lib/messaging/contacts"),
      import("@/lib/notifications/push"),
      import("@/lib/mail"),
    ]);
    const icon = severity === "critical" ? "🚨" : "⚠️";
    const push = await sendUserPush(await platformAdminIds(), {
      title: `${icon} ${alert.title}`,
      body: alert.detail.slice(0, 180),
      data: { type: "ops-alert", url, tag: `ops-${alert.key}` },
      ttlSeconds: 24 * 3600,
    }).catch(() => 0);
    const base = env.APP_BASE_URL.replace(/\/+$/, "");
    const mail = await sendMail({
      to: env.MAIL_ADMIN,
      subject: `${icon} ZekerFlex: ${alert.title}`,
      text: `${alert.detail}\n\nBekijken: ${base}${url}\n\n(Deze melding komt hoogstens één keer per ${severity === "critical" ? "uur" : "6 uur"} voor hetzelfde probleem.)`,
      kind: "ops-alert",
    })
      .then(() => true)
      .catch(() => false);
    const webhook = await postOpsWebhook(env.OPS_ALERT_WEBHOOK, `${icon} ${alert.title}\n${alert.detail}\n${base}${url}`);

    const entry: LoggedAlert = { key: alert.key, title: alert.title, detail: alert.detail, severity, url, at: new Date(now).toISOString(), sent: { push, mail, webhook } };
    const log = (await kvGet<LoggedAlert[]>(LOG_KEY)) ?? [];
    await kvSet(LOG_KEY, [entry, ...log].slice(0, 100));
    logger.warn("owner alert", { key: alert.key, severity, push, mail, webhook });
    return "sent";
  } catch (err) {
    logger.error("owner alert failed", { key: alert.key, error: (err as Error).message });
    return "failed";
  }
}

/** Fire-and-forget variant for hot paths (never awaited, never throws). */
export function alertOwnerLater(alert: OpsAlert): void {
  void alertOwner(alert).catch(() => undefined);
}

export async function recentAlerts(limit = 30): Promise<LoggedAlert[]> {
  return ((await kvGet<LoggedAlert[]>(LOG_KEY)) ?? []).slice(0, limit);
}
