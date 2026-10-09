import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { llmHealth } from "@/lib/ai/client";
import { pushChannels } from "@/lib/notifications/push";
import { budgetSnapshot } from "@/lib/ai/governor";
import { env } from "@/lib/env";
import { smtpConfigured } from "@/lib/mail";
import { PageHeader, Panel, KpiCard, StatusPill } from "@/components/app/ui";

export const dynamic = "force-dynamic";

async function ok(fn: () => Promise<unknown>): Promise<{ ok: boolean; ms: number; detail?: string }> {
  const t = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - t };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, detail: (e as Error).message };
  }
}

export default async function SysteemPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Geen toegang" subtitle="Systeemstatus is alleen voor platformbeheerders." />
      </div>
    );
  }

  async function whisperReachable(): Promise<boolean> {
    if (!env.WHISPER_ENABLED) return false;
    const base = env.WHISPER_BASE_URL.replace(/\/+$/, "");
    for (const url of [base.replace(/\/v1$/, "") + "/health", base + "/models"]) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
        if (r.ok) return true;
      } catch {
        /* try next */
      }
    }
    return false;
  }

  const [db, cache, llm, budget, whisperOk] = await Promise.all([
    ok(() => prisma.$queryRaw`SELECT 1`),
    ok(() => redis.ping()),
    llmHealth().catch(() => ({ ok: false, baseUrl: "?", model: "?" })),
    budgetSnapshot().catch(() => null),
    whisperReachable(),
  ]);
  const channels = pushChannels();

  // "off" = a deliberately optional feature that's simply not switched on —
  // visually distinct from "crit", which means something expected to work is
  // actually broken right now. Lumping both under one red "Storing" pill
  // made an intentional, zero-cost choice (Whisper/Studio disabled) look like
  // the same kind of problem as a genuine outage (Ollama unreachable).
  type State = "ok" | "crit" | "off";
  const components: { label: string; state: State; meta: string }[] = [
    { label: "PostgreSQL", state: db.ok ? "ok" : "crit", meta: `${db.ms} ms` },
    { label: "Redis", state: cache.ok ? "ok" : "crit", meta: `${cache.ms} ms` },
    { label: "Lokale AI (Ollama)", state: llm.ok ? "ok" : "crit", meta: llm.ok ? llm.model : "niet bereikbaar" },
    {
      label: "Soevereiniteitsgrendel",
      state: (budget ? budget.localInference : true) ? "ok" : "crit",
      meta: budget ? (budget.localInference ? `lokaal · ${budget.host}` : "externe host!") : "onbekend",
    },
    {
      label: "Web Push (VAPID)",
      state: channels.webPush ? "ok" : "crit",
      meta: channels.webPush ? "geconfigureerd" : "niet ingesteld",
    },
    {
      label: "Spraakherkenning (Whisper)",
      state: !env.WHISPER_ENABLED ? "off" : whisperOk ? "ok" : "crit",
      meta: !env.WHISPER_ENABLED ? "uitgeschakeld (optioneel)" : whisperOk ? env.WHISPER_MODEL : "start met: npm run whisper",
    },
    {
      label: "Mailserver (SMTP)",
      state: smtpConfigured() ? "ok" : "crit",
      meta: smtpConfigured() ? `${env.SMTP_HOST}:${env.SMTP_PORT}` : "mailbox-only — zie /admin/mail",
    },
    {
      label: "Beeldgenerator (Studio)",
      state: env.IMAGE_ENABLED ? "ok" : "off",
      meta: env.IMAGE_ENABLED ? `${env.IMAGE_BACKEND} · ${env.IMAGE_BASE_URL}` : "uitgeschakeld (optioneel)",
    },
  ];
  const TONE: Record<State, { tone: "ok" | "crit" | "neutral"; label: string }> = {
    ok: { tone: "ok", label: "OK" },
    crit: { tone: "crit", label: "Storing" },
    off: { tone: "neutral", label: "Uitgeschakeld" },
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Systeemstatus" subtitle="De in-box afhankelijkheden van het platform, live gecontroleerd." />

      {budget && (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="AI-tokens vandaag"
            value={`${Math.round(budget.tokensUsed / 1000)}k`}
            hint={`budget ${Math.round(budget.tokenBudget / 1000)}k`}
            tone="brand"
          />
          <KpiCard label="Rekensloten" value={`${budget.concurrencyInUse}/${budget.concurrencyMax}`} />
          <KpiCard label="Verzoeken/min" value={`${budget.requestsThisMinute}/${budget.requestsPerMinute}`} />
        </div>
      )}

      <Panel title="Componenten">
        <ul className="divide-y divide-hair">
          {components.map((c) => {
            const t = TONE[c.state];
            return (
              <li key={c.label} className="flex items-center justify-between px-5 py-4">
                <span className="text-sm font-medium text-ink">{c.label}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-xs text-neutralx-400">{c.meta}</span>
                  <StatusPill tone={t.tone}>{t.label}</StatusPill>
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>

      {!db.ok && db.detail && (
        <p className="mt-4 rounded-lg bg-crit/10 px-4 py-3 text-sm text-crit">Database: {db.detail}</p>
      )}
    </div>
  );
}
