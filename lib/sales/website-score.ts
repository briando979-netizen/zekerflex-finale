import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { runWebsiteCheck } from "@/lib/website-check/run";

// ---------------------------------------------------------------------------
// Websitescore per sales-lead. Leads met een bekende bedrijfswebsite (sourceUrl,
// gevonden door de careers-crawl) krijgen de gratis website-check: een lage
// score is een concrete aanleiding voor de verkoper om Website-beheer aan te
// bieden ("je site is traag en mist een omschrijving voor Google"). Alleen
// openbare gegevens van de openbare site; maximaal één keer per 30 dagen per
// lead, en in kleine porties per dagelijkse sales-run.
// ---------------------------------------------------------------------------

import { leadWebsiteUrl, needsWebsiteCheck, type LeadWebsiteCheck } from "@/lib/sales/website-score-shared";

export { leadWebsiteUrl, needsWebsiteCheck, websiteCheckOf, WEBSITE_OPPORTUNITY_BELOW, type LeadWebsiteCheck } from "@/lib/sales/website-score-shared";

const CLOSED = ["WON", "LOST", "DISQUALIFIED", "BOUNCED", "UNSUBSCRIBED"] as const;

/** Draait de website-check voor één lead en bewaart de uitkomst bij de lead. */
export async function scoreLeadWebsite(leadId: string): Promise<LeadWebsiteCheck> {
  const lead = await prisma.salesLead.findUnique({ where: { id: leadId }, select: { sourceUrl: true, enrichmentJson: true } });
  const url = leadWebsiteUrl(lead?.sourceUrl);
  if (!lead || !url) throw new Error("Van deze lead is geen website bekend.");
  const r = await runWebsiteCheck(url);
  const check: LeadWebsiteCheck = {
    checkId: r.id,
    host: r.host,
    score: r.score,
    problems: r.findings.filter((f) => f.status === "probleem").length,
    attention: r.findings.filter((f) => f.status === "let-op").length,
    platform: r.platform,
    at: r.at,
  };
  const enrichment = (lead.enrichmentJson && typeof lead.enrichmentJson === "object" ? lead.enrichmentJson : {}) as Record<string, unknown>;
  await prisma.salesLead.update({
    where: { id: leadId },
    data: { enrichmentJson: { ...enrichment, websiteCheck: check } as unknown as Prisma.InputJsonValue },
  });
  return check;
}

/** Dagelijks (na de sales-run): een paar open leads met website zonder verse check. */
export async function sweepLeadWebsites(limit = 8): Promise<{ checked: number; failed: number }> {
  const leads = await prisma.salesLead.findMany({
    where: { sourceUrl: { startsWith: "http" }, status: { notIn: [...CLOSED] }, suppressed: false },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, sourceUrl: true, enrichmentJson: true },
  });
  const todo = leads.filter((l) => leadWebsiteUrl(l.sourceUrl) && needsWebsiteCheck(l.enrichmentJson)).slice(0, limit);
  let checked = 0;
  let failed = 0;
  for (const l of todo) {
    try {
      await scoreLeadWebsite(l.id);
      checked += 1;
    } catch (err) {
      failed += 1;
      logger.info("lead website check skipped", { leadId: l.id, reason: (err as Error).message });
    }
  }
  if (todo.length) logger.info("lead website sweep", { checked, failed });
  return { checked, failed };
}
