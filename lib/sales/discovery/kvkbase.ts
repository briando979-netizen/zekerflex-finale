import type { SalesCampaign } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isKvkBaseEnabled, searchCompanies } from "@/lib/integrations/kvkbase";
import { createLead } from "@/lib/sales/leads";

// ---------------------------------------------------------------------------
// Discovery via the Handelsregister (KVKBase). Builds queries from the
// campaign's target sectors × cities, dedupes against existing leads by KVK
// number, and creates NEW leads (no e-mail yet — enrichment + a later careers
// crawl or the field team fills that in).
// ---------------------------------------------------------------------------

const DEFAULT_SECTORS = ["horeca", "logistiek", "retail", "schoonmaak", "evenementen", "zorg"];

export interface KvkBaseDiscoveryResult {
  created: number;
  seen: number;
  queries: string[];
  skipped: number;
}

export async function discoverViaKvkBase(
  campaign: SalesCampaign,
  limitPerRun = 12,
): Promise<KvkBaseDiscoveryResult> {
  const result: KvkBaseDiscoveryResult = { created: 0, seen: 0, queries: [], skipped: 0 };
  if (!isKvkBaseEnabled()) {
    logger.info("kvkbase discovery skipped — no API key");
    return result;
  }

  const sectors = campaign.targetSectors.length ? campaign.targetSectors : DEFAULT_SECTORS;
  const cities = campaign.targetCities.length ? campaign.targetCities : [""];

  const queries: string[] = [];
  for (const s of sectors) {
    for (const c of cities) {
      queries.push([s, c].filter(Boolean).join(" ").trim());
    }
  }
  // Keep a run bounded: at most a handful of queries per tick.
  const runQueries = queries.slice(0, 4);
  result.queries = runQueries;

  for (const q of runQueries) {
    if (result.created >= limitPerRun) break;
    let hits;
    try {
      hits = await searchCompanies(q, 15);
    } catch (err) {
      logger.warn("kvkbase search failed", { q, error: (err as Error).message });
      continue;
    }
    for (const hit of hits) {
      if (result.created >= limitPerRun) break;
      result.seen += 1;
      if (!hit.isActive || hit.kvkNumber.length !== 8) {
        result.skipped += 1;
        continue;
      }
      const existing = await prisma.salesLead.findFirst({
        where: { kvkNumber: hit.kvkNumber },
        select: { id: true },
      });
      if (existing) {
        result.skipped += 1;
        continue;
      }
      await createLead({
        companyName: hit.legalName,
        kvkNumber: hit.kvkNumber,
        city: hit.city ?? undefined,
        sector: q.split(" ")[0],
        source: "kvkbase",
        createdById: null,
        campaignId: campaign.id,
      });
      result.created += 1;
    }
  }

  logger.info("kvkbase discovery run", { campaign: campaign.id, ...result });
  return result;
}
