import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePeriod } from "@/lib/admin/period";
import { salesInsights } from "@/lib/admin/insights/sales";
import { count, percentOf } from "@/lib/admin/format";
import { BarList, Funnel, KpiStrip, PageHead, Panel, PeriodTabs } from "@/components/admin/kit";
import { Chart } from "@/components/admin/kit-client";
import { env } from "@/lib/env";
import { listLeads } from "@/lib/sales/leads";
import { listCampaigns, startOfToday } from "@/lib/sales/campaign";
import { enginePaused } from "@/lib/sales/engine";
import { listSuppression } from "@/lib/sales/suppression";
import { SalesConsole } from "@/components/admin/sales/SalesConsole";
import type { LeadDto } from "@/components/admin/SalesDashboard";
import { websiteCheckOf } from "@/lib/sales/website-score-shared";
import type { CampaignDto } from "@/components/admin/sales/CampaignsTab";
import type { EngineSnapshot } from "@/components/admin/sales/EngineTab";

export const dynamic = "force-dynamic";

export default async function SalesAdminPage(props: { searchParams: Promise<{ periode?: string }> }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Het sales-dashboard is alleen voor platformbeheerders." />;
  }
  const { periode } = await props.searchParams;
  const period = resolvePeriod(periode);

  const [insights, rows, campaignRows, suppression, paused, sentToday, scheduled, engineRuns] = await Promise.all([
    salesInsights(period),
    listLeads({ limit: 200 }),
    listCampaigns(),
    listSuppression(200),
    enginePaused(),
    prisma.salesOutreach.count({ where: { sentAt: { gte: startOfToday() } } }),
    prisma.salesLead.findMany({
      where: { nextActionAt: { not: null }, suppressed: false, repliedAt: null },
      orderBy: { nextActionAt: "asc" },
      take: 10,
      select: { id: true, companyName: true, nextActionAt: true, sequenceStep: true },
    }),
    prisma.salesEngineRun.findMany({ orderBy: { startedAt: "desc" }, take: 15 }),
  ]);

  const leads: LeadDto[] = rows.map((l) => ({
    id: l.id,
    companyName: l.companyName,
    kvkNumber: l.kvkNumber,
    contactName: l.contactName,
    contactEmail: l.contactEmail,
    contactPhone: l.contactPhone,
    city: l.city,
    sector: l.sector,
    source: l.source,
    status: l.status,
    score: l.score,
    scoreRationale: l.scoreRationale,
    notes: l.notes,
    vacancySignal: l.vacancySignal,
    sourceUrl: l.sourceUrl,
    websiteCheck: websiteCheckOf(l.enrichmentJson),
    sequenceStep: l.sequenceStep,
    nextActionAt: l.nextActionAt ? l.nextActionAt.toISOString() : null,
    invitedAt: l.invitedAt ? l.invitedAt.toISOString() : null,
    lastContactedAt: l.lastContactedAt ? l.lastContactedAt.toISOString() : null,
    createdAt: l.createdAt.toISOString(),
    outreach: l.outreach[0]
      ? {
          id: l.outreach[0].id,
          status: l.outreach[0].status,
          subject: l.outreach[0].subject,
          updatedAt: l.outreach[0].updatedAt.toISOString(),
        }
      : null,
  }));

  const campaigns: CampaignDto[] = await Promise.all(
    campaignRows.map(async (c) => {
      const [sentCount, repliedCount, wonCount, queuedCount] = await Promise.all([
        prisma.salesLead.count({ where: { campaignId: c.id, status: { in: ["SENT", "REPLIED", "WON"] } } }),
        prisma.salesLead.count({ where: { campaignId: c.id, status: "REPLIED" } }),
        prisma.salesLead.count({ where: { campaignId: c.id, status: "WON" } }),
        prisma.salesLead.count({ where: { campaignId: c.id, status: "QUEUED" } }),
      ]);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        mode: c.mode,
        dailyCap: c.dailyCap,
        minScore: c.minScore,
        sendStartHour: c.sendStartHour,
        sendEndHour: c.sendEndHour,
        workdaysOnly: c.workdaysOnly,
        targetSectors: c.targetSectors,
        targetCities: c.targetCities,
        autopilotEnabledGlobally: env.SALES_AUTOPILOT_ENABLED,
        leadCount: c._count.leads,
        sentCount,
        repliedCount,
        wonCount,
        queuedCount,
        sources: c.sources.map((s) => ({
          id: s.id,
          kind: s.kind,
          url: s.url,
          label: s.label,
          enabled: s.enabled,
          lastRunAt: s.lastRunAt ? s.lastRunAt.toISOString() : null,
        })),
      };
    }),
  );

  const engine: EngineSnapshot = {
    config: {
      engineEnabled: env.SALES_ENGINE_ENABLED,
      autopilotEnabled: env.SALES_AUTOPILOT_ENABLED,
      globalDailyCap: env.SALES_DAILY_CAP_GLOBAL,
      tickMinutes: env.SALES_ENGINE_TICK_MINUTES,
    },
    paused,
    sentToday,
    queuedForReview: campaigns.reduce((n, c) => n + c.queuedCount, 0),
    scheduled: scheduled.map((s) => ({
      id: s.id,
      companyName: s.companyName,
      nextActionAt: s.nextActionAt ? s.nextActionAt.toISOString() : null,
      sequenceStep: s.sequenceStep,
    })),
    runs: engineRuns.map((r) => ({
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      discovered: r.discovered,
      enriched: r.enriched,
      scored: r.scored,
      drafted: r.drafted,
      sent: r.sent,
      skipped: r.skipped,
      summary: r.summary,
    })),
  };

  const suppressionDto = suppression.map((e) => ({
    email: e.email,
    domain: e.domain,
    reason: e.reason,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-4">
      <PageHead
        title="Sales-pijplijn"
        subtitle="Leads van buitendienst, import en de site: verrijken, scoren, benaderen en opvolgen."
        actions={<PeriodTabs period={period} basePath="/admin/sales" />}
      />

      <KpiStrip
        items={[
          { label: "Nieuwe leads", value: count(insights.newCount), hint: `laatste ${period.label}`, spark: insights.newSeries },
          { label: "Open in de pijplijn", value: count(insights.open), hint: `van ${count(insights.total)} leads` },
          { label: "In gesprek", value: count(insights.talking), hint: "wachten op jouw opvolging", ...(insights.talking > 0 ? { tone: "warn" as const } : {}) },
          { label: "Gewonnen", value: count(insights.won), hint: `${percentOf(insights.won, insights.funnel[1]?.value ?? 0)}% van wie benaderd is`, tone: "ok" },
          { label: "Vandaag verstuurd", value: `${count(sentToday)} / ${count(env.SALES_DAILY_CAP_GLOBAL)}`, hint: "dagelijkse grens van de motor" },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Panel title="Nieuwe leads" subtitle={`Per ${period.bucket === "month" ? "maand" : "dag"}, laatste ${period.label}`} className="lg:col-span-1">
          <Chart title="Nieuwe leads per periode" kind="bars" unit="count" labels={insights.labels} series={[{ label: "Nieuwe leads", values: insights.newSeries }]} height={170} emptyText="Geen nieuwe leads in deze periode." />
        </Panel>
        <Panel title="Doorstroom" subtitle="Alle leads, van eerste contact tot klant">
          <Funnel stages={insights.funnel} />
        </Panel>
        <Panel title="Waar leads vandaan komen">
          <BarList emptyText="Nog geen leads." rows={insights.sources.map((s) => ({ key: s.key, label: s.label, value: s.value, display: count(s.value) }))} />
        </Panel>
      </div>

      <SalesConsole
        initialLeads={leads}
        initialCampaigns={campaigns}
        initialEngine={engine}
        initialSuppression={suppressionDto}
      />
    </div>
  );
}
