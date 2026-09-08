import { Prisma, type SalesCampaign, type SalesLead } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redis, acquireLock } from "@/lib/redis";
import { announce } from "@/lib/voice/announce";
import { recordAudit } from "@/lib/audit";
import { enrichLead, scoreLead } from "@/lib/sales/leads";
import { draftOutreach, approveOutreach } from "@/lib/sales/outreach";
import { sendOutreachMail } from "@/lib/sales/send";
import { isSuppressed, domainOf } from "@/lib/sales/suppression";
import {
  campaignSendCountToday,
  globalSendCountToday,
  withinSendWindow,
} from "@/lib/sales/campaign";
import { discoverViaKvkBase } from "@/lib/sales/discovery/kvkbase";
import { crawlCareersSource } from "@/lib/sales/discovery/careers";

// ---------------------------------------------------------------------------
// The recruiter motor. One tick:
//   1. discover companies (KVKBase / careers crawl), throttled per source
//   2. enrich + score a small batch of new leads
//   3. for due leads above the fit threshold: draft the next sequence step;
//      in AUTOPILOT (and only then) approve + send within the hard caps
//   4. expire stale sequences
// Every step is wrapped so one failure never aborts the tick. Nothing sends
// unless a campaign is on AUTOPILOT *and* SALES_AUTOPILOT_ENABLED is true.
// ---------------------------------------------------------------------------

const PAUSE_KEY = "sales:engine:paused";
const TICK_LOCK = "sales:engine:tick";
const DISCOVERY_INTERVAL_MS = 6 * 60 * 60 * 1000;
const ENRICH_PER_TICK = 5;
const DRAFT_PER_TICK = 8;
const DOMAIN_COOLDOWN_DAYS = 14;

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T, errors: string[]): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = `${label}: ${(err as Error).message}`;
    logger.warn("sales engine step failed", { label, error: (err as Error).message });
    errors.push(msg);
    return fallback;
  }
}

export async function enginePaused(): Promise<boolean> {
  return (await redis.get(PAUSE_KEY).catch(() => null)) === "1";
}

export async function pauseEngine(actorUserId?: string | null): Promise<void> {
  await redis.set(PAUSE_KEY, "1").catch(() => undefined);
  await recordAudit({
    category: "SALES",
    action: "sales.engine.paused",
    actorUserId: actorUserId ?? null,
    severity: "warning",
    summary: "Sales-motor gepauzeerd (kill-switch)",
  });
}

export async function resumeEngine(actorUserId?: string | null): Promise<void> {
  await redis.del(PAUSE_KEY).catch(() => undefined);
  await recordAudit({
    category: "SALES",
    action: "sales.engine.resumed",
    actorUserId: actorUserId ?? null,
    summary: "Sales-motor hervat",
  });
}

export interface SalesTickOptions {
  campaignId?: string;
  /** Bypass the SALES_ENGINE_ENABLED master switch + pause (manual "run now"). */
  force?: boolean;
}

export interface SalesTickResult {
  ok: boolean;
  skipped?: string;
  runId?: string;
  discovered: number;
  enriched: number;
  scored: number;
  drafted: number;
  sent: number;
  skippedSends: number;
  errors: string[];
}

function leadEmail(lead: SalesLead): string | null {
  return lead.contactEmail || lead.discoveredEmail || null;
}

async function domainOnCooldown(email: string): Promise<boolean> {
  const dom = domainOf(email);
  if (!dom) return false;
  const since = new Date(Date.now() - DOMAIN_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const recent = await prisma.salesLead.findFirst({
    where: {
      lastContactedAt: { gte: since },
      OR: [
        { contactEmail: { endsWith: `@${dom}` } },
        { discoveredEmail: { endsWith: `@${dom}` } },
      ],
    },
    select: { id: true },
  });
  return Boolean(recent);
}

async function runDiscovery(campaign: SalesCampaign, force: boolean, errors: string[]): Promise<number> {
  let discovered = 0;
  const sources = await prisma.salesDiscoverySource.findMany({
    where: { campaignId: campaign.id, enabled: true },
  });

  // Implicit KVKBase discovery when the campaign targets sectors but has no
  // explicit KVKBASE source.
  const hasKvkSource = sources.some((s) => s.kind === "KVKBASE");
  if (!hasKvkSource && campaign.targetSectors.length) {
    const key = `sales:disc:kvk:${campaign.id}`;
    if (force || !(await redis.get(key).catch(() => null))) {
      const r = await safe(
        "kvkbase-discovery",
        () => discoverViaKvkBase(campaign),
        { created: 0, seen: 0, queries: [], skipped: 0 },
        errors,
      );
      discovered += r.created;
      await redis.set(key, "1", "PX", DISCOVERY_INTERVAL_MS).catch(() => undefined);
    }
  }

  for (const source of sources) {
    const due =
      force ||
      !source.lastRunAt ||
      Date.now() - source.lastRunAt.getTime() > DISCOVERY_INTERVAL_MS;
    if (!due) continue;

    if (source.kind === "KVKBASE") {
      const r = await safe(
        `kvkbase-source:${source.id}`,
        () => discoverViaKvkBase(campaign),
        { created: 0, seen: 0, queries: [], skipped: 0 },
        errors,
      );
      discovered += r.created;
      await prisma.salesDiscoverySource
        .update({
          where: { id: source.id },
          data: { lastRunAt: new Date(), lastResultJson: r as unknown as Prisma.InputJsonValue },
        })
        .catch(() => undefined);
    } else if (source.kind === "CAREERS_URL") {
      const r = await safe(
        `careers:${source.id}`,
        () => crawlCareersSource(source),
        null,
        errors,
      );
      if (r) {
        discovered += r.created;
        await prisma.salesDiscoverySource
          .update({
            where: { id: source.id },
            data: { lastRunAt: new Date(), lastResultJson: r as unknown as Prisma.InputJsonValue },
          })
          .catch(() => undefined);
      }
    }
    // CSV sources are import-only (handled by the upload endpoint).
  }

  return discovered;
}

async function enrichAndScore(
  campaign: SalesCampaign,
  errors: string[],
): Promise<{ enriched: number; scored: number }> {
  let enriched = 0;
  let scored = 0;

  const fresh = await prisma.salesLead.findMany({
    where: {
      campaignId: campaign.id,
      status: { in: ["NEW", "ENRICHED"] },
      score: null,
    },
    orderBy: { createdAt: "asc" },
    take: ENRICH_PER_TICK,
  });

  for (const lead of fresh) {
    if (lead.kvkNumber) {
      await safe(
        `enrich:${lead.id}`,
        async () => {
          await enrichLead(lead.id, null);
          enriched += 1;
        },
        undefined,
        errors,
      );
    }
    await safe(
      `score:${lead.id}`,
      async () => {
        await scoreLead(lead.id, null);
        scored += 1;
      },
      undefined,
      errors,
    );
  }

  return { enriched, scored };
}

async function processDueLeads(
  campaign: SalesCampaign,
  errors: string[],
): Promise<{ drafted: number; sent: number; skippedSends: number }> {
  let drafted = 0;
  let sent = 0;
  let skippedSends = 0;

  const now = new Date();
  const autopilot =
    campaign.mode === "AUTOPILOT" && env.SALES_AUTOPILOT_ENABLED && !!campaign.autopilotConfirmedAt;

  // Cap headroom for this tick (autopilot only).
  let headroom = DRAFT_PER_TICK;
  if (autopilot) {
    const [campToday, globalToday] = await Promise.all([
      campaignSendCountToday(campaign.id),
      globalSendCountToday(),
    ]);
    headroom = Math.max(
      0,
      Math.min(
        DRAFT_PER_TICK,
        campaign.dailyCap - campToday,
        env.SALES_DAILY_CAP_GLOBAL - globalToday,
      ),
    );
    if (!withinSendWindow(campaign, now)) headroom = 0;
  }
  if (headroom <= 0 && autopilot) return { drafted, sent, skippedSends };

  const maxDelay = Math.max(...campaign.stepDelaysDays, 0);
  const due = await prisma.salesLead.findMany({
    where: {
      campaignId: campaign.id,
      suppressed: false,
      repliedAt: null,
      bouncedAt: null,
      score: { gte: campaign.minScore },
      sequenceStep: { lt: campaign.stepDelaysDays.length },
      status: { notIn: ["WON", "LOST", "DISQUALIFIED", "BOUNCED", "UNSUBSCRIBED", "REPLIED"] },
      OR: [
        { sequenceStep: 0, outreach: { none: { status: { notIn: ["DISCARDED"] } } } },
        { nextActionAt: { lte: now } },
      ],
    },
    orderBy: [{ score: "desc" }, { createdAt: "asc" }],
    take: autopilot ? headroom : DRAFT_PER_TICK,
  });

  for (const lead of due) {
    const email = leadEmail(lead);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      skippedSends += 1;
      continue;
    }

    const sup = await isSuppressed(email).catch(() => ({ blocked: false }) as const);
    if (sup.blocked) {
      await prisma.salesLead
        .update({
          where: { id: lead.id },
          data: {
            suppressed: true,
            suppressedReason: sup.detail ?? sup.reason ?? "onderdrukt",
            nextActionAt: null,
          },
        })
        .catch(() => undefined);
      skippedSends += 1;
      continue;
    }

    if (lead.sequenceStep === 0 && (await domainOnCooldown(email))) {
      // Another lead on this domain was contacted very recently — hold off.
      await prisma.salesLead
        .update({
          where: { id: lead.id },
          data: { nextActionAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) },
        })
        .catch(() => undefined);
      skippedSends += 1;
      continue;
    }

    const outreach = await safe(
      `draft:${lead.id}`,
      () => draftOutreach(lead.id, null, lead.sequenceStep),
      null,
      errors,
    );
    if (!outreach) continue;
    drafted += 1;

    if (!autopilot) {
      await prisma.salesLead
        .update({ where: { id: lead.id }, data: { status: "QUEUED" } })
        .catch(() => undefined);
      continue;
    }

    await safe(`approve:${outreach.id}`, () => approveOutreach(outreach.id, null), null, errors);
    const outcome = await safe(
      `send:${outreach.id}`,
      () => sendOutreachMail(outreach.id, "autopilot"),
      { status: "failed" as const, outreachId: outreach.id },
      errors,
    );
    if (outcome.status === "sent") sent += 1;
    else skippedSends += 1;
  }

  // Expire sequences that ran out.
  await prisma.salesLead
    .updateMany({
      where: {
        campaignId: campaign.id,
        status: { in: ["SENT", "QUEUED"] },
        repliedAt: null,
        sequenceStep: { gte: campaign.stepDelaysDays.length },
        lastContactedAt: { lt: new Date(now.getTime() - (maxDelay + 7) * 24 * 60 * 60 * 1000) },
      },
      data: { status: "LOST", nextActionAt: null },
    })
    .catch(() => undefined);

  return { drafted, sent, skippedSends };
}

export async function runSalesEngineTick(opts: SalesTickOptions = {}): Promise<SalesTickResult> {
  const base: SalesTickResult = {
    ok: true,
    discovered: 0,
    enriched: 0,
    scored: 0,
    drafted: 0,
    sent: 0,
    skippedSends: 0,
    errors: [],
  };

  if (!opts.force && !env.SALES_ENGINE_ENABLED) {
    return { ...base, ok: false, skipped: "engine uit (SALES_ENGINE_ENABLED=false)" };
  }
  if (!opts.force && (await enginePaused())) {
    return { ...base, ok: false, skipped: "motor gepauzeerd (kill-switch)" };
  }

  const unlock = await acquireLock(TICK_LOCK, 5 * 60 * 1000);
  if (!unlock) return { ...base, ok: false, skipped: "vorige tick draait nog" };

  const run = await prisma.salesEngineRun.create({
    data: { campaignId: opts.campaignId ?? null },
  });
  base.runId = run.id;

  try {
    const campaigns = opts.campaignId
      ? await prisma.salesCampaign.findMany({ where: { id: opts.campaignId } })
      : await prisma.salesCampaign.findMany({ where: { status: "ACTIVE" } });

    for (const campaign of campaigns) {
      base.discovered += await runDiscovery(campaign, !!opts.force, base.errors);
      const es = await enrichAndScore(campaign, base.errors);
      base.enriched += es.enriched;
      base.scored += es.scored;
      const dd = await processDueLeads(campaign, base.errors);
      base.drafted += dd.drafted;
      base.sent += dd.sent;
      base.skippedSends += dd.skippedSends;
    }

    const summary = `${campaigns.length} campagne(s): ${base.discovered} ontdekt, ${base.enriched} verrijkt, ${base.scored} gescoord, ${base.drafted} concept, ${base.sent} verzonden, ${base.skippedSends} overgeslagen`;
    await prisma.salesEngineRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        discovered: base.discovered,
        enriched: base.enriched,
        scored: base.scored,
        drafted: base.drafted,
        sent: base.sent,
        skipped: base.skippedSends,
        errorsJson: base.errors.slice(0, 50) as unknown as Prisma.InputJsonValue,
        summary,
      },
    });

    if (base.sent > 0 || base.discovered > 0) {
      void announce({
        text: `Sales-motor: ${base.sent} mail${base.sent === 1 ? "" : "s"} verstuurd, ${base.discovered} nieuwe lead${base.discovered === 1 ? "" : "s"}.`,
        category: "sales",
        source: "sales-ai",
      });
    }
    logger.info("sales engine tick done", { runId: run.id, ...base, errors: base.errors.length });
    return base;
  } catch (err) {
    await prisma.salesEngineRun
      .update({
        where: { id: run.id },
        data: { finishedAt: new Date(), summary: `Tick faalde: ${(err as Error).message}` },
      })
      .catch(() => undefined);
    return { ...base, ok: false, errors: [...base.errors, (err as Error).message] };
  } finally {
    await unlock();
  }
}
