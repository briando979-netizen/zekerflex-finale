import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { llmConfigProblem, llmHealth } from "@/lib/ai/client";
import { AI_FEATURES } from "@/lib/ai/features";
import { AiFeaturesPanel } from "@/components/admin/AiFeaturesPanel";
import { RagLab } from "@/components/admin/RagLab";
import { ModelFleet } from "@/components/admin/ModelFleet";
import { CronHealthPanel } from "@/components/admin/CronHealthPanel";
import { FeatureFlagsPanel } from "@/components/admin/FeatureFlagsPanel";
import { FunnelPanel } from "@/components/admin/FunnelPanel";
import { pushChannels } from "@/lib/notifications/push";
import { budgetSnapshot } from "@/lib/ai/governor";
import { cronHeartbeats } from "@/lib/ops/heartbeat";
import { env } from "@/lib/env";
import { smtpConfigured } from "@/lib/mail";
import { count, percentOf } from "@/lib/admin/format";
import { KpiStrip, Meter, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { Tabs } from "@/components/admin/kit-client";
import { OpsAlerts } from "@/components/admin/OpsAlerts";
import { UsagePanel } from "@/components/admin/UsagePanel";

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
    return <PageHead title="Geen toegang" subtitle="Systeemstatus is alleen voor platformbeheerders." />;
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

  const [db, cache, llm, budget, whisperOk, crons] = await Promise.all([
    ok(() => prisma.$queryRaw`SELECT 1`),
    ok(() => redis.ping()),
    llmHealth().catch(() => ({ ok: false, baseUrl: "?", model: "?" })),
    budgetSnapshot().catch(() => null),
    whisperReachable(),
    cronHeartbeats().catch(() => []),
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
      meta: budget ? (budget.localInference ? `lokaal, ${budget.host}` : "externe host!") : "onbekend",
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
      meta: smtpConfigured() ? `${env.SMTP_HOST}:${env.SMTP_PORT}` : "alleen mailbox, zie /admin/mail",
    },
    {
      label: "Beeldgenerator (Studio)",
      state: env.IMAGE_ENABLED ? "ok" : "off",
      meta: env.IMAGE_ENABLED ? `${env.IMAGE_BACKEND}, ${env.IMAGE_BASE_URL}` : "uitgeschakeld (optioneel)",
    },
  ];
  const TONE: Record<State, { tone: "ok" | "crit" | "neutral"; label: string }> = {
    ok: { tone: "ok", label: "OK" },
    crit: { tone: "crit", label: "Storing" },
    off: { tone: "neutral", label: "Uitgeschakeld" },
  };
  const broken = components.filter((c) => c.state === "crit").length;
  const working = components.filter((c) => c.state === "ok").length;
  const staleJobs = crons.filter((c) => c.stale).length;

  return (
    <div className="space-y-4">
      <PageHead
        title="Systeem"
        subtitle="De afhankelijkheden van het platform, live gecontroleerd, met AI, geplande taken, functies en gebruik."
        meta={<Pill tone={broken === 0 ? "ok" : "crit"}>{broken === 0 ? "Alles werkt" : `${broken} ${broken === 1 ? "storing" : "storingen"}`}</Pill>}
      />

      <KpiStrip
        items={[
          { label: "Componenten", value: `${working} van ${components.length}`, hint: broken === 0 ? "werken zoals verwacht" : `${broken} met een storing`, ...(broken > 0 ? { tone: "crit" as const } : {}) },
          { label: "Geplande taken", value: `${crons.length - staleJobs} van ${crons.length}`, hint: staleJobs === 0 ? "op schema" : `${staleJobs} te laat`, ...(staleJobs > 0 ? { tone: "crit" as const } : {}) },
          { label: "AI-tokens vandaag", value: budget ? `${count(Math.round(budget.tokensUsed / 1000))}k` : "—", hint: budget ? `${percentOf(budget.tokensUsed, budget.tokenBudget)}% van het budget` : "onbekend" },
          { label: "Rekensloten", value: budget ? `${budget.concurrencyInUse} / ${budget.concurrencyMax}` : "—", hint: "tegelijk in gebruik" },
          { label: "Verzoeken per minuut", value: budget ? `${budget.requestsThisMinute} / ${budget.requestsPerMinute}` : "—", hint: "naar het taalmodel" },
        ]}
      />

      <Tabs
        label="Onderdelen van het systeem"
        tabs={[
          {
            id: "componenten",
            label: "Componenten",
            badge: broken || null,
            content: (
              <>
                {!db.ok && db.detail && <Notice tone="crit" role="alert">Database: {db.detail}</Notice>}
                <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
                  <Panel flush title="Componenten" subtitle="Elke keer dat je deze pagina opent opnieuw gecontroleerd">
                    <ul>
                      {components.map((c) => {
                        const t = TONE[c.state];
                        return (
                          <li key={c.label} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                            <span className="text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>{c.label}</span>
                            <span className="flex min-w-0 items-center gap-3">
                              <span className="truncate font-mono text-xs" style={{ color: "var(--a-mute)" }}>{c.meta}</span>
                              <Pill tone={t.tone}>{t.label}</Pill>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </Panel>
                  {budget && (
                    <Panel title="AI-budget" subtitle="Vandaag, op het eigen model">
                      <div className="space-y-4">
                        <Meter label="Tokens" value={budget.tokensUsed} max={budget.tokenBudget} display={`${count(Math.round(budget.tokensUsed / 1000))}k van ${count(Math.round(budget.tokenBudget / 1000))}k`} tone={budget.tokensUsed >= budget.tokenBudget ? "crit" : "ok"} />
                        <Meter label="Rekensloten" value={budget.concurrencyInUse} max={budget.concurrencyMax} display={`${budget.concurrencyInUse} van ${budget.concurrencyMax}`} tone="plan" />
                        <Meter label="Verzoeken deze minuut" value={budget.requestsThisMinute} max={budget.requestsPerMinute} display={`${budget.requestsThisMinute} van ${budget.requestsPerMinute}`} tone="plan" />
                      </div>
                    </Panel>
                  )}
                </div>
              </>
            ),
          },
          {
            id: "ai",
            label: "AI",
            content: (
              <>
                <AiFeaturesPanel features={AI_FEATURES} connected={llm.ok} problem={llm.ok ? null : (llmConfigProblem() ?? (("detail" in llm && llm.detail) || "Taalmodel niet bereikbaar"))} />
                <ModelFleet />
                <RagLab />
              </>
            ),
          },
          {
            id: "taken",
            label: "Taken en meldingen",
            badge: staleJobs || null,
            content: (
              <>
                <CronHealthPanel />
                <OpsAlerts />
              </>
            ),
          },
          { id: "functies", label: "Functies aan en uit", content: <FeatureFlagsPanel /> },
          {
            id: "gebruik",
            label: "Gebruik en snelheid",
            content: (
              <>
                <FunnelPanel />
                <UsagePanel />
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
