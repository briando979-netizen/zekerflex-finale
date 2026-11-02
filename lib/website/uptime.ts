import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { alertOwner } from "@/lib/ops/alert";
import { recordCronRun } from "@/lib/metrics";
import { sendMail, mailShell, mailButton } from "@/lib/mail";
import { FetchError, fetchPage } from "@/lib/website-check/fetch";
import { runWebsiteCheck } from "@/lib/website-check/run";
import { hostOf } from "@/lib/website/verify";

// ---------------------------------------------------------------------------
// Bewaking van de websites die wij beheren (Website-beheer). Elke 5 minuten
// kijken of de homepage antwoordt; pas na twee mislukte metingen achter elkaar
// telt de site als offline (geen alarm om één hik). Bij offline en weer online
// krijgen de eigenaar (push + mail) en de klant (mail) bericht. Daarnaast elke
// week de website-check, met de score in het klantdashboard. Zo is wat Website-
// beheer belooft ("wij bewaken je site") ook echt waar.
// ---------------------------------------------------------------------------

export const DOWN_AFTER_FAILURES = 2;
const KEEP_DAYS = 30;
const KEEP_INCIDENTS = 20;
const KEEP_WEEKS = 12;

export interface UptimeDay {
  date: string; // YYYY-MM-DD (UTC)
  checks: number;
  ok: number;
  msTotal: number;
}

export interface UptimeIncident {
  start: string;
  end: string | null;
  reason: string;
}

export interface UptimeState {
  host: string;
  /** null = nog nooit gemeten */
  up: boolean | null;
  since: string | null;
  lastCheckAt: string | null;
  lastStatus: number | null;
  lastMs: number | null;
  lastError: string | null;
  failStreak: number;
  firstFailAt: string | null;
  days: UptimeDay[];
  incidents: UptimeIncident[];
}

export interface Probe {
  ok: boolean;
  status: number | null;
  ms: number | null;
  error: string | null;
}

export type UptimeEvent = "down" | "up" | null;

export const emptyState = (host: string): UptimeState => ({
  host, up: null, since: null, lastCheckAt: null, lastStatus: null, lastMs: null, lastError: null,
  failStreak: 0, firstFailAt: null, days: [], incidents: [],
});

/** Verwerkt één meting. Puur: geeft de nieuwe toestand en of er iets gemeld moet worden. */
export function applyProbe(prev: UptimeState, probe: Probe, now: Date): { state: UptimeState; event: UptimeEvent } {
  const at = now.toISOString();
  const date = at.slice(0, 10);
  const days = [...prev.days];
  const last = days[days.length - 1];
  const day = last && last.date === date ? { ...last } : { date, checks: 0, ok: 0, msTotal: 0 };
  day.checks += 1;
  if (probe.ok) {
    day.ok += 1;
    day.msTotal += probe.ms ?? 0;
  }
  if (last && last.date === date) days[days.length - 1] = day;
  else days.push(day);

  const state: UptimeState = {
    ...prev,
    lastCheckAt: at,
    lastStatus: probe.status,
    lastMs: probe.ms,
    lastError: probe.error,
    days: days.slice(-KEEP_DAYS),
    incidents: [...prev.incidents],
  };

  if (probe.ok) {
    const wasDown = prev.up === false;
    state.failStreak = 0;
    state.firstFailAt = null;
    if (prev.up !== true) {
      state.up = true;
      state.since = at;
    }
    if (wasDown) {
      const open = state.incidents[state.incidents.length - 1];
      if (open && !open.end) state.incidents[state.incidents.length - 1] = { ...open, end: at };
      return { state, event: "up" };
    }
    return { state, event: null };
  }

  state.failStreak = prev.failStreak + 1;
  state.firstFailAt = prev.firstFailAt ?? at;
  if (prev.up !== false && state.failStreak >= DOWN_AFTER_FAILURES) {
    state.up = false;
    state.since = state.firstFailAt;
    state.incidents = [...state.incidents, { start: state.firstFailAt, end: null, reason: probe.error ?? `foutcode ${probe.status ?? "?"}` }].slice(-KEEP_INCIDENTS);
    return { state, event: "down" };
  }
  return { state, event: null };
}

/** Percentage geslaagde metingen over de bewaarde dagen (null zonder metingen). */
export function uptimePercent(state: UptimeState, lastDays = KEEP_DAYS): number | null {
  const days = state.days.slice(-lastDays);
  const checks = days.reduce((s, d) => s + d.checks, 0);
  if (checks === 0) return null;
  const ok = days.reduce((s, d) => s + d.ok, 0);
  return Math.floor((ok / checks) * 1000) / 10;
}

export function averageMs(state: UptimeState, lastDays = 1): number | null {
  const days = state.days.slice(-lastDays);
  const ok = days.reduce((s, d) => s + d.ok, 0);
  return ok > 0 ? Math.round(days.reduce((s, d) => s + d.msTotal, 0) / ok) : null;
}

const KEY = (siteId: string) => `site-uptime:${siteId}`;
const WEEKLY_KEY = (siteId: string) => `site-weekly:${siteId}`;

export interface WeeklyHistory {
  host: string;
  checks: { at: string; score: number; checkId: string }[];
}

export async function getUptime(siteId: string): Promise<UptimeState | null> {
  return kvGet<UptimeState>(KEY(siteId)).catch(() => null);
}

export async function getWeekly(siteId: string): Promise<WeeklyHistory | null> {
  return kvGet<WeeklyHistory>(WEEKLY_KEY(siteId)).catch(() => null);
}

async function probe(host: string): Promise<Probe> {
  const t = Date.now();
  try {
    const res = await fetchPage(`https://${host}/`, { headersOnly: true, timeoutMs: 10_000, maxRedirects: 5 });
    const ms = Date.now() - t;
    // 4xx (bijv. een firewall die ons weert) betekent: de server leeft. Alleen 5xx telt als storing.
    return res.status < 500 ? { ok: true, status: res.status, ms, error: null } : { ok: false, status: res.status, ms, error: `foutcode ${res.status}` };
  } catch (err) {
    return { ok: false, status: null, ms: null, error: err instanceof FetchError ? err.message : "geen antwoord" };
  }
}

/** Sites die we bewaken: betaald en niet gepauzeerd/opgezegd, met een geldig domein. */
async function monitoredSites() {
  const rows = await prisma.managedWebsite.findMany({
    where: { status: { in: ["SUBMITTED", "ACTIVE"] }, domain: { not: null } },
    select: { id: true, domain: true, requestedById: true, tenant: { select: { name: true } } },
  });
  return rows.flatMap((r) => {
    const host = hostOf(r.domain);
    return host ? [{ id: r.id, host, requestedById: r.requestedById, tenantName: r.tenant.name }] : [];
  });
}

const when = (iso: string) => new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

async function notifyCustomer(userId: string | null, host: string, event: "down" | "up", state: UptimeState): Promise<void> {
  if (!userId) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, fullName: true } }).catch(() => null);
  if (!user?.email) return;
  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  const hi = user.fullName ? `Hoi ${user.fullName.split(" ")[0]},` : "Hoi,";
  const down = event === "down";
  const body = down
    ? `${hi}\n\nJe website ${host} is sinds ${when(state.since ?? new Date().toISOString())} niet bereikbaar (${state.lastError ?? "geen antwoord"}). Wij hebben een melding gekregen en kijken ernaar. Je hoeft zelf niets te doen.`
    : `${hi}\n\nJe website ${host} is weer bereikbaar. Wij houden hem in de gaten.`;
  await sendMail({
    to: user.email,
    kind: down ? "website-offline" : "website-online",
    subject: down ? `Je website ${host} is offline` : `Je website ${host} is weer online`,
    text: `${body}\n\nBekijk de status: ${base}/werkgever/website`,
    html: mailShell(down ? "Je website is offline" : "Je website is weer online", `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">${body.replace(/\n\n/g, "</p><p style=\"margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42\">")}</p><p style="margin:0">${mailButton(`${base}/werkgever/website`, "Bekijk de status")}</p>`),
  }).catch((e) => logger.warn("uptime customer mail failed", { error: (e as Error).message }));
}

/** Elke 5 minuten (cron): alle beheerde sites meten en bij een wissel melden. */
export async function runUptimeSweep(now = new Date()): Promise<{ checked: number; down: string[]; events: number }> {
  const sites = await monitoredSites();
  const down: string[] = [];
  let events = 0;
  const queue = [...sites];
  await Promise.all(Array.from({ length: 5 }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const prev = (await getUptime(s.id)) ?? emptyState(s.host);
      const base = prev.host === s.host ? prev : emptyState(s.host);
      const { state, event } = applyProbe(base, await probe(s.host), now);
      await kvSet(KEY(s.id), state);
      if (state.up === false) down.push(s.host);
      if (!event) continue;
      events += 1;
      await alertOwner({
        key: `site-${event}:${s.id}`,
        title: event === "down" ? `Website van ${s.tenantName} offline: ${s.host}` : `Website van ${s.tenantName} weer online: ${s.host}`,
        detail: event === "down" ? `Twee metingen achter elkaar mislukt (${state.lastError ?? "geen antwoord"}).` : "De site antwoordt weer.",
        severity: event === "down" ? "critical" : "warning",
        url: "/admin/website-beheer",
      });
      await notifyCustomer(s.requestedById, s.host, event, state);
    }
  }));
  recordCronRun("site-uptime", true);
  return { checked: sites.length, down, events };
}

/** Elke week (cron): de website-check op elke beheerde site, met de score in de geschiedenis. */
export async function runWeeklySiteChecks(): Promise<{ checked: number; failed: number }> {
  const sites = await monitoredSites();
  let failed = 0;
  for (const s of sites) {
    try {
      const check = await runWebsiteCheck(`https://${s.host}/`);
      const prev = await getWeekly(s.id);
      const history = prev && prev.host === s.host ? prev.checks : [];
      const before = history[history.length - 1];
      await kvSet(WEEKLY_KEY(s.id), { host: s.host, checks: [...history, { at: check.at, score: check.score, checkId: check.id }].slice(-KEEP_WEEKS) } satisfies WeeklyHistory);
      if (before && before.score - check.score >= 10) {
        await alertOwner({
          key: `site-score:${s.id}`,
          title: `Website-score van ${s.host} gezakt: ${before.score} → ${check.score}`,
          detail: `De wekelijkse check van ${s.tenantName} scoort ${before.score - check.score} punten lager dan vorige week.`,
          severity: "warning",
          url: "/admin/website-beheer",
        });
      }
    } catch (err) {
      failed += 1;
      logger.warn("weekly site check failed", { host: s.host, error: (err as Error).message });
    }
  }
  recordCronRun("site-weekly-check", failed === 0);
  return { checked: sites.length, failed };
}

export interface MonitorView {
  up: boolean | null;
  since: string | null;
  lastCheckAt: string | null;
  lastMs: number | null;
  avgMs: number | null;
  uptime30: number | null;
  incidents: UptimeIncident[];
  weekly: { score: number; at: string; checkId: string; previous: number | null } | null;
  /** laatste geslaagde nachtelijke back-up (lib/website/site-backup.ts) */
  backup: { at: string; bytes: number } | null;
}

/** Wat klant en beheerder te zien krijgen. */
export async function monitorView(siteId: string, domain: string | null): Promise<MonitorView | null> {
  const host = hostOf(domain);
  if (!host) return null;
  const [u, w, b] = await Promise.all([getUptime(siteId), getWeekly(siteId), kvGet<{ host: string; last: { ok: boolean; at: string; bytes: number } | null }>(`site-backup:${siteId}`).catch(() => null)]);
  const state = u && u.host === host ? u : null;
  const weekly = w && w.host === host ? w.checks : [];
  const latest = weekly[weekly.length - 1];
  return {
    up: state?.up ?? null,
    since: state?.since ?? null,
    lastCheckAt: state?.lastCheckAt ?? null,
    lastMs: state?.lastMs ?? null,
    avgMs: state ? averageMs(state) : null,
    uptime30: state ? uptimePercent(state) : null,
    incidents: (state?.incidents ?? []).slice(-5).reverse(),
    weekly: latest ? { ...latest, previous: weekly[weekly.length - 2]?.score ?? null } : null,
    backup: b && b.host === host && b.last?.ok ? { at: b.last.at, bytes: b.last.bytes } : null,
  };
}
