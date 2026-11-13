import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { llmConfigProblem, llmHealth } from "@/lib/ai/client";
import { AI_FEATURES } from "@/lib/ai/features";
import { AiFeaturesPanel } from "@/components/admin/AiFeaturesPanel";
import { RagLab } from "@/components/admin/RagLab";
import { ModelFleet } from "@/components/admin/ModelFleet";
import { CronHealthPanel } from "@/components/admin/CronHealthPanel";
import { RondgangPanel } from "@/components/admin/RondgangPanel";
import { SchijfreeksPanel } from "@/components/admin/SchijfreeksPanel";
import { BoekrondePanel } from "@/components/admin/BoekrondePanel";
import { FeatureFlagsPanel } from "@/components/admin/FeatureFlagsPanel";
import { FunnelPanel } from "@/components/admin/FunnelPanel";
import { pushChannels } from "@/lib/notifications/push";
import { budgetSnapshot } from "@/lib/ai/governor";
import { cronHeartbeats } from "@/lib/ops/heartbeat";
import { readBackupReport, BACKUP_MAX_AGE_HOURS, DISK_CRIT_PERCENT, DISK_WARN_PERCENT, type BackupReport } from "@/lib/ops/backup";
import { BackupActies } from "@/components/admin/BackupActies";
import { env } from "@/lib/env";
import { smtpConfigured } from "@/lib/mail";
import { count, dateTimeNl, percentOf, timeAgoNl } from "@/lib/admin/format";
import { Empty, InfoList, KpiStrip, Meter, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { Tabs } from "@/components/admin/kit-client";
import { OpsAlerts } from "@/components/admin/OpsAlerts";
import { MeldingenHier } from "@/components/admin/MeldingenHier";
import { UsagePanel } from "@/components/admin/UsagePanel";
import { ErrorJournalPanel } from "@/components/admin/ErrorJournalPanel";
import { listErrorGroups } from "@/lib/ops/error-journal";
import { agentLeeft, leesLive } from "@/lib/bouwer/live";
import { bouwerGezond, bouwerIngesteld, bouwerInstellingen } from "@/lib/bouwer/werker";
import { crowdsecGezond } from "@/lib/ops/crowdsec";
import { nieuwsteControle } from "@/lib/bouwer/controles";
import { controleTekst } from "@/lib/bouwer/controles-tekst";

export const dynamic = "force-dynamic";

const BACKUP_STATE: Record<BackupReport["state"], string> = {
  ok: "In orde",
  failed: "Mislukt",
  stale: "Te oud",
  missing: "Nog geen",
};
const VERIFY_STATE: Record<BackupReport["verificatie"]["state"], string> = {
  ok: "Geslaagd",
  failed: "Probleem",
  stale: "Te lang geleden",
  missing: "Nog niet gedaan",
};
const ENCRYPTED_TEKST: Record<string, string> = {
  none: "geen versleutelde kopie (BACKUP_PASSPHRASE niet gezet)",
  ok: "versleutelde kopie ontcijferd en identiek aan het origineel",
  failed: "versleutelde kopie NIET te ontcijferen",
  "no-passphrase": "versleutelde kopie aanwezig, maar de wachtwoordzin is niet (meer) bekend op de server",
};
const OFFSITE_TEKST: Record<string, string> = {
  none: "niet ingesteld",
  ok: "aanwezig en even groot als het origineel",
  missing: "ontbreekt op de kopieplek",
  "size-mismatch": "andere grootte dan het origineel",
  "no-encrypted-copy": "ingesteld, maar er is geen versleutelde kopie om te sturen (zet BACKUP_PASSPHRASE)",
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

  const [db, cache, llm, budget, whisperOk, crons, backup, errorGroups, liveStand, bouwerOk, bouwerSet, adminPush, aanval, laatsteControle] = await Promise.all([
    ok(() => prisma.$queryRaw`SELECT 1`),
    ok(() => redis.ping()),
    llmHealth().catch(() => ({ ok: false, baseUrl: "?", model: "?" })),
    budgetSnapshot().catch(() => null),
    whisperReachable(),
    cronHeartbeats().catch(() => []),
    readBackupReport().catch((): BackupReport => ({ available: false, state: "missing", reasons: [], status: null, files: [], disk: null, waarschuwing: null, ophaal: { state: "uit", reasons: [], status: null }, verificatie: { state: "missing", reasons: [], status: null, history: [] } })),
    listErrorGroups(500).catch(() => []),
    leesLive().catch(() => null),
    bouwerGezond(),
    bouwerInstellingen().catch(() => null),
    // devices of platform admins that still take our pushes (owner alerts go there)
    prisma.webPushSubscription
      .count({ where: { disabledAt: null, user: { disabledAt: null, memberships: { some: { role: "PLATFORM_ADMIN" } } } } })
      .catch(() => null),
    // Beveiliging → Aanvalsbescherming: de CrowdSec-engine naast Caddy (deploy/crowdsec)
    crowdsecGezond(),
    // ZekerFlex AI → Live zetten: de nieuwste uitslag van de controle vóór het bouwen (lib/bouwer/controles.ts)
    nieuwsteControle(),
  ]);
  const now = new Date();
  const recentErrors = errorGroups.filter((g) => g.level === "error" && now.getTime() - Date.parse(g.lastAt) < 86_400_000).length;
  const channels = pushChannels();
  // ingesteld, maar geen enkel apparaat van een beheerder neemt onze meldingen aan: knop eronder
  const pushZonderApparaat = channels.webPush && adminPush === 0;

  // "off" = a deliberately optional feature that's simply not switched on —
  // visually distinct from "crit", which means something expected to work is
  // actually broken right now. Lumping both under one red "Storing" pill
  // made an intentional, zero-cost choice (Whisper/Studio disabled) look like
  // the same kind of problem as a genuine outage (Ollama unreachable).
  type State = "ok" | "crit" | "off";
  const components: { label: string; state: State; meta: string }[] = [
    { label: "PostgreSQL", state: db.ok ? "ok" : "crit", meta: `${db.ms} ms` },
    { label: "Redis", state: cache.ok ? "ok" : "crit", meta: `${cache.ms} ms` },
    // the model may be local (Ollama) or, by the owner's choice, external (AI_ALLOW_REMOTE)
    { label: "Taalmodel (AI)", state: llm.ok ? "ok" : "crit", meta: llm.ok ? `${llm.model}${budget ? `, ${budget.host}` : ""}` : "niet bereikbaar" },
    {
      label: "Soevereiniteitsgrendel",
      // a deliberately opened lock (AI_ALLOW_REMOTE=true) is a choice, not an outage; only an external
      // host that was never allowed is a problem (and then the AI isn't used at all, lib/ai/client.ts)
      state: !budget || budget.localInference ? "ok" : env.AI_ALLOW_REMOTE ? "off" : "crit",
      meta: !budget ? "onbekend" : budget.localInference ? `lokaal, ${budget.host}` : env.AI_ALLOW_REMOTE ? `bewust open: AI via ${budget.host}` : `externe host ${budget.host} niet toegestaan`,
    },
    {
      label: "Web Push (VAPID)",
      // configured is not enough: on 3 Nov the admins had no device that accepted our key, for weeks, unnoticed
      state: !channels.webPush || adminPush === 0 ? "crit" : "ok",
      meta: !channels.webPush
        ? "niet ingesteld"
        : adminPush === null
          ? "geconfigureerd"
          : adminPush === 0
            ? "geen werkend apparaat bij de beheerders"
            : `geconfigureerd, ${adminPush} ${adminPush === 1 ? "apparaat" : "apparaten"} van beheerders`,
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
      // eigen beeldserver, of de gratis Cloudflare-route (FLUX, ±170 foto's per dag; lib/ai/images.ts → beeldBackend)
      state: env.IMAGE_ENABLED || (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN) ? "ok" : "off",
      meta: env.IMAGE_ENABLED
        ? `${env.IMAGE_BACKEND}, ${env.IMAGE_BASE_URL}`
        : env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN
          ? "Cloudflare FLUX (gratis, ±170 foto's per dag)"
          : "wacht op de gratis Cloudflare-sleutel (Admin → Te doen: Gratis AI-foto's via Cloudflare)",
    },
    {
      label: "Database-back-up",
      state: !backup.available ? "off" : backup.state === "ok" ? "ok" : "crit",
      meta: !backup.available ? "niet op deze omgeving" : backup.status ? `laatste ${dateTimeNl(backup.status.at, now)}` : "nog geen back-up",
    },
    // ZekerFlex AI → Live zetten: de dienst op de server die uitrolt (deploy/bouwer/zf-live.py)
    {
      label: "Live-zetter (uitrollen)",
      state: !liveStand?.hartslag ? "off" : agentLeeft(liveStand.hartslag) ? "ok" : "crit",
      meta: !liveStand?.hartslag ? "niet op deze omgeving" : agentLeeft(liveStand.hartslag) ? "draait op de server" : `reageert niet sinds ${dateTimeNl(liveStand.hartslag.op, now)}`,
    },
    // Beveiliging → Aanvalsbescherming: blokkeert scanners, brute force en bekende aanvallers (deploy/crowdsec)
    {
      label: "Aanvalsbescherming (CrowdSec)",
      state: aanval,
      meta: aanval === "off" ? "niet op deze omgeving" : aanval === "ok" ? "engine bereikbaar, zie Beveiliging" : "engine reageert niet",
    },
    // ZekerFlex AI → Live zetten: tsc, eslint en tests op de nieuwste main vóór hij live kan (deploy/bouwer/werker/controle.mjs)
    {
      label: "Controle vóór uitrol",
      state: !bouwerIngesteld() || !laatsteControle ? "off" : laatsteControle.ok ? "ok" : "crit",
      meta: !bouwerIngesteld() ? "niet geïnstalleerd (optioneel)" : !laatsteControle ? "nog geen uitslag" : `${laatsteControle.kort}: ${controleTekst(laatsteControle)}`,
    },
    // ZekerFlex AI → Bouwer: de AI-programmeur (deploy/bouwer/werker)
    {
      label: "Bouwer (AI-programmeur)",
      state: !bouwerIngesteld() ? "off" : bouwerOk?.ok ? "ok" : "crit",
      meta: !bouwerIngesteld()
        ? "niet geïnstalleerd (optioneel)"
        : !bouwerOk?.ok
          ? "reageert niet"
          : `${bouwerSet?.model ?? "?"}${bouwerSet && !bouwerSet.githubSleutel ? ", GitHub-sleutel ontbreekt" : ""}`,
    },
  ];
  const backupBroken = backup.available && backup.state !== "ok";
  const verify = backup.verificatie;
  const verifyBroken = backup.available && (verify.state === "failed" || verify.state === "stale");
  const disk = backup.disk;
  const diskTone = !disk ? "neutral" : disk.usedPercent >= DISK_CRIT_PERCENT ? "crit" : disk.usedPercent >= DISK_WARN_PERCENT ? "warn" : "ok";
  // zelfde eenheid als df en TransIP (1024-machten), anders lijkt de schijf groter
  const gb = (bytes: number) => `${count(Math.round(bytes / 1024 ** 3))} GB`;
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
                    {pushZonderApparaat && (
                      <div className="px-4 py-3 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                        <MeldingenHier />
                      </div>
                    )}
                  </Panel>
                  {budget && (
                    <Panel title="AI-budget" subtitle={budget.localInference ? "Vandaag, op het eigen model" : `Vandaag, op ${budget.host}`}>
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
                <SchijfreeksPanel />
                <RondgangPanel />
                <BoekrondePanel />
                <OpsAlerts />
              </>
            ),
          },
          {
            id: "backups",
            label: "Back-ups",
            badge: backupBroken || verifyBroken ? (backupBroken ? 1 : 0) + (verifyBroken ? 1 : 0) : null,
            content: !backup.available ? (
              <Panel title="Back-ups">
                <Empty title="Geen back-upmap op deze omgeving" body="De nachtelijke back-up draait op de server (docker-compose.vps.yml). Hier is niets te tonen." />
              </Panel>
            ) : (
              <>
                {backupBroken && <Notice tone="crit" role="alert">{backup.reasons.join(" ")}</Notice>}
                {backup.waarschuwing && <Notice tone="warn">{backup.waarschuwing}</Notice>}
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
                          { label: "Bewaard", value: `${count(backup.files.length)} ${backup.files.length === 1 ? "back-up" : "back-ups"}` },
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
                {verifyBroken && <Notice tone="crit" role="alert">{verify.reasons.join(" ")}</Notice>}
                <div className="grid items-start gap-4 lg:grid-cols-[1fr_1fr]">
                  <Panel
                    title="Hersteltest (diepgaand)"
                    subtitle="Elke zondag, en op verzoek: de nieuwste back-up wordt teruggezet en tabel voor tabel vergeleken met het moment van de back-up"
                    actions={<Pill tone={verify.state === "ok" ? "ok" : verify.state === "missing" ? "neutral" : "crit"}>{VERIFY_STATE[verify.state]}</Pill>}
                  >
                    {verify.status ? (
                      <>
                        <InfoList
                          rows={[
                            { label: "Getest", value: `${dateTimeNl(verify.status.at, now)} (${timeAgoNl(verify.status.at, now.getTime())}), ${count(verify.status.seconds)} s` },
                            { label: "Bestand", value: verify.status.file || "—" },
                            { label: "Vingerafdruk", value: verify.status.shaOk ? "klopt" : "klopt niet (bestand veranderd of beschadigd)" },
                            { label: "Terugzetten", value: verify.status.restoreOk ? `gelukt, ${count(verify.status.tables)} tabellen` : "mislukt" },
                            {
                              label: "Rijen per tabel",
                              value:
                                verify.status.compared === 0
                                  ? "niet vergeleken (oudere back-up zonder telling)"
                                  : verify.status.mismatched === 0
                                    ? `alle ${count(verify.status.compared)} tabellen precies gelijk aan het moment van de back-up`
                                    : `${count(verify.status.mismatched)} van ${count(verify.status.compared)} tabellen wijken af${verify.status.missing ? `, ${count(verify.status.missing)} ontbreken` : ""}`,
                            },
                            { label: "Uploads", value: verify.status.storage.file ? (verify.status.storage.ok ? `archief compleet leesbaar, ${count(verify.status.storage.files)} bestanden` : "archief niet leesbaar") : "—" },
                            { label: "Versleutelde kopie", value: ENCRYPTED_TEKST[verify.status.encrypted] ?? verify.status.encrypted },
                            { label: "Kopie buiten de server", value: OFFSITE_TEKST[verify.status.offsite] ?? verify.status.offsite },
                          ]}
                        />
                        {verify.status.mismatches.length > 0 && (
                          <ul className="mt-3 space-y-1 text-xs" style={{ color: "var(--a-mute)" }}>
                            {verify.status.mismatches.slice(0, 12).map((m) => (
                              <li key={m.table}>
                                <span className="font-mono" style={{ color: "var(--a-text)" }}>{m.table}</span>: {m.got === null ? "ontbreekt" : `${count(m.got)} in plaats van ${count(m.expected)} rijen`}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <Empty title="Nog geen hersteltest" body="De back-updienst doet de eerste vanzelf bij het opstarten, daarna elke zondag. Of start hem nu met de knop hieronder." />
                    )}
                    <div className="mt-4">
                      <BackupActies agentLeeft={Boolean(liveStand?.hartslag && agentLeeft(liveStand.hartslag))} />
                    </div>
                  </Panel>
                  <div className="space-y-4">
                    <Panel title="Kopie buiten de server" subtitle="Versleuteld (AES-256) naar een eigen reserveserver of WebDAV-opslag, elke nacht na de back-up">
                      <InfoList
                        rows={[
                          { label: "Versleuteling", value: backup.status?.encrypted ? "aan: naast elke back-up staat een .enc-kopie" : "uit: zet BACKUP_PASSPHRASE in .env.production (en bewaar die zin ook buiten de server)" },
                          { label: "Kopieplek", value: backup.status?.offsite.configured ? backup.status.offsite.target : "niet ingesteld: zet BACKUP_OFFSITE (scp://… of https://…)" },
                          {
                            label: "Laatste nacht",
                            value: !backup.status?.offsite.configured ? "—" : backup.status.offsite.ok ? "kopie gelukt" : `mislukt: ${backup.status.offsite.error || "onbekende fout"}`,
                          },
                          {
                            label: "Kopie op de pc",
                            value: backup.ophaal.status
                              ? `laatst ${dateTimeNl(backup.ophaal.status.at, now)} (${timeAgoNl(backup.ophaal.status.at, now.getTime())}), set ${backup.ophaal.status.set}`
                              : "niet ingesteld (deploy/backup/OPHALEN.md)",
                          },
                        ]}
                      />
                      {backup.ophaal.state === "oud" && (
                        <div className="mt-3">
                          <Notice tone="warn">{backup.ophaal.reasons.join(" ")}</Notice>
                        </div>
                      )}
                    </Panel>
                    <Panel flush title="Geschiedenis van de hersteltests" subtitle="Nieuwste eerst">
                      {verify.history.length === 0 ? (
                        <Empty title="Nog geen tests" />
                      ) : (
                        <ul>
                          {verify.history.slice(0, 12).map((h) => (
                            <li key={h.at} className="flex items-center justify-between gap-3 px-4 py-2 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                              <span className="flex items-center gap-2 text-[0.8125rem]" style={{ color: "var(--a-text)" }}>
                                <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: h.ok ? "var(--a-ok)" : "var(--a-crit)" }} />
                                {dateTimeNl(h.at, now)}
                                <span className="sr-only">{h.ok ? " geslaagd" : " mislukt"}</span>
                              </span>
                              <span className="num text-xs" style={{ color: "var(--a-mute)" }}>
                                {h.ok ? `${count(h.compared || h.tables)} tabellen gelijk` : h.error || "probleem"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Panel>
                  </div>
                </div>
                <Notice>
                  {backup.status?.offsite.ok || backup.ophaal.state === "ok"
                    ? `Er staat elke nacht een versleutelde kopie buiten deze server${backup.status?.offsite.ok ? "" : " (op de pc van de eigenaar)"}. Terugzetten vanaf die kopie staat in deploy/DISASTER-RECOVERY.md.`
                    : "Deze back-ups staan op dezelfde server als de database. Ze beschermen tegen fouten en wissen, niet tegen het kwijtraken van de hele server. Zet BACKUP_PASSPHRASE en BACKUP_OFFSITE (zie Te doen) voor een versleutelde kopie elders; terugzetten staat in deploy/DISASTER-RECOVERY.md."}
                </Notice>
              </>
            ),
          },
          { id: "fouten", label: "Foutmeldingen", badge: recentErrors || null, content: <ErrorJournalPanel /> },
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
