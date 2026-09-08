import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { listLeads } from "@/lib/sales/leads";
import { listCampaigns, startOfToday } from "@/lib/sales/campaign";
import { enginePaused } from "@/lib/sales/engine";
import { listSuppression } from "@/lib/sales/suppression";
import { SalesConsole } from "@/components/admin/sales/SalesConsole";
import type { LeadDto } from "@/components/admin/SalesDashboard";
import type { CampaignDto } from "@/components/admin/sales/CampaignsTab";
import type { EngineSnapshot } from "@/components/admin/sales/EngineTab";

export const dynamic = "force-dynamic";

export default async function SalesAdminPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHeader title="Geen toegang" subtitle="Het sales-dashboard is alleen voor platformbeheerders." />;
  }

  const [rows, campaignRows, suppression, paused, sentToday, scheduled, engineRuns] = await Promise.all([
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
    <SalesConsole
      initialLeads={leads}
      initialCampaigns={campaigns}
      initialEngine={engine}
      initialSuppression={suppressionDto}
    />
  );
}
