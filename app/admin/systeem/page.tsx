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
import { readBackupReport, BACKUP_MAX_AGE_HOURS, DISK_CRIT_PERCENT, DISK_WARN_PERCENT, type BackupReport } from "@/lib/ops/backup";
import { env } from "@/lib/env";
import { smtpConfigured } from "@/lib/mail";
import { count, dateTimeNl, percentOf, timeAgoNl } from "@/lib/admin/format";
import { Empty, InfoList, KpiStrip, Meter, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { Tabs } from "@/components/admin/kit-client";
import { OpsAlerts } from "@/components/admin/OpsAlerts";
import { UsagePanel } from "@/components/admin/UsagePanel";

export const dynamic = "force-dynamic";

const BACKUP_STATE: Record<BackupReport["state"], string> = {
  ok: "In orde",
  failed: "Mislukt",
  stale: "Te oud",
  missing: "Nog geen",
};

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

  const [db, cache, llm, budget, whisperOk, crons, backup] = await Promise.all([
    ok(() => prisma.$queryRaw`SELECT 1`),
    ok(() => redis.ping()),
    llmHealth().catch(() => ({ ok: false, baseUrl: "?", model: "?" })),
    budgetSnapshot().catch(() => null),
    whisperReachable(),
    cronHeartbeats().catch(() => []),
    readBackupReport().catch((): BackupReport => ({ available: false, state: "missing", reasons: [], status: null, files: [], disk: null })),
  ]);
  const now = new Date();
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
    {
      label: "Database-back-up",
      state: !backup.available ? "off" : backup.state === "ok" ? "ok" : "crit",
      meta: !backup.available ? "niet op deze omgeving" : backup.status ? `laatste ${dateTimeNl(backup.status.at, now)}` : "nog geen back-up",
    },
  ];
  const backupBroken = backup.available && backup.state !== "ok";
  const disk = backup.disk;
  const diskTone = !disk ? "neutral" : disk.usedPercent >= DISK_CRIT_PERCENT ? "crit" : disk.usedPercent >= DISK_WARN_PERCENT ? "warn" : "ok";
  const gb = (bytes: number) => `${count(Math.round(bytes / 1e9))} GB`;
  const mb = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} MB` : `${count(Math.round(bytes / 1e3))} kB`);
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
          {
            id: "backups",
            label: "Back-ups",
            badge: backupBroken ? 1 : null,
            content: !backup.available ? (
              <Panel title="Back-ups">
                <Empty title="Geen back-upmap op deze omgeving" body="De nachtelijke back-up draait op de server (docker-compose.vps.yml). Hier is niets te tonen." />
              </Panel>
            ) : (
              <>
                {backupBroken && <Notice tone="crit" role="alert">{backup.reasons.join(" ")}</Notice>}
                <div className="grid items-start gap-4 lg:grid-cols-[1fr_1fr]">
                  <Panel
                    title="Laatste back-up"
                    subtitle="Elke nacht, daarna proef-teruggezet in een wegwerp-database"
                    actions={<Pill tone={backup.state === "ok" ? "ok" : "crit"}>{BACKUP_STATE[backup.state]}</Pill>}
                  >
                    {backup.status ? (
                      <InfoList
                        rows={[
                          { label: "Gemaakt", value: `${dateTimeNl(backup.status.at, now)} (${timeAgoNl(backup.status.at, now.getTime())})` },
                          { label: "Database", value: mb(backup.status.bytes) },
                          { label: "Uploads", value: backup.status.storageFile ? mb(backup.status.storageBytes) : "—" },
                          {
                            label: "Proef-terugzetting",
                            value: backup.status.restore.ok
                              ? `${count(backup.status.restore.tables)} tabellen, ${count(backup.status.restore.users)} gebruikers (live ${count(backup.status.restore.liveUsers)})`
                              : "mislukt",
                          },
                          { label: "Duur", value: `${count(backup.status.seconds)} s` },
                          { label: "Bewaard", value: `${count(backup.files.length)} back-ups` },
                        ]}
                      />
                    ) : (
                      <Empty title="Nog geen back-up" body={`De eerste wordt gemaakt zodra de back-updienst start. Daarna elke nacht; na ${BACKUP_MAX_AGE_HOURS} uur zonder nieuwe krijg je een melding.`} />
                    )}
                  </Panel>
                  <div className="space-y-4">
                    <Panel title="Serverschijf" subtitle={`Melding vanaf ${DISK_WARN_PERCENT}%, kritiek vanaf ${DISK_CRIT_PERCENT}%. Elke update ruimt oude versies zelf op.`}>
                      {disk ? (
                        <Meter label="In gebruik" value={disk.usedPercent} max={100} display={`${disk.usedPercent}%, ${gb(disk.freeBytes)} vrij van ${gb(disk.totalBytes)}`} tone={diskTone} />
                      ) : (
                        <p className="text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>Onbekend</p>
                      )}
                    </Panel>
                    <Panel flush title="Bewaarde back-ups" subtitle="Op de server in ~/zekerflex/backups">
                      {backup.files.length === 0 ? (
                        <Empty title="Nog geen bestanden" />
                      ) : (
                        <ul>
                          {backup.files.map((f) => (
                            <li key={f.name} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                              <span className="text-[0.8125rem]" style={{ color: "var(--a-text)" }}>{dateTimeNl(f.at, now)}</span>
                              <span className="num font-mono text-xs" style={{ color: "var(--a-mute)" }}>{mb(f.bytes)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Panel>
                  </div>
                </div>
                <Notice>Deze back-ups staan op dezelfde server als de database. Ze beschermen tegen fouten en wissen, niet tegen het kwijtraken van de hele server. Hoe je ze ook elders bewaart en terugzet staat in deploy/DISASTER-RECOVERY.md.</Notice>
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
