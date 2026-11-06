import type { SalesCampaign } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { osmZoekBedrijven } from "@/lib/integrations/osm-plaatsen";
import { createLead } from "@/lib/sales/leads";

// ---------------------------------------------------------------------------
// Bedrijven vinden voor de buitendienst via OpenStreetMap — gratis en zonder
// sleutel, als tegenhanger van lib/sales/discovery/kvkbase.ts (die rekent per
// opvraging af tegen een tegoed en liep 6 november tegen zijn limiet aan).
//
// Wat we hier wél krijgen: naam, plaats, adres, telefoon en website. Wat we
// NIET krijgen: een KVK-nummer — dat staat niet in OpenStreetMap. Ontdubbelen
// gaat daarom op naam + plaats, en het KVK-nummer vult de buitendienst (of de
// verrijking) later aan. Een lead zonder KVK-nummer is prima: die wordt toch
// pas een klant nadat iemand hem spreekt.
// ---------------------------------------------------------------------------

const STANDAARD_SECTOREN = ["horeca", "logistiek", "retail", "schoonmaak", "evenementen", "zorg"];

export interface OsmDiscoveryResult {
  created: number;
  seen: number;
  queries: string[];
  skipped: number;
}

export async function discoverViaOsm(
  campaign: SalesCampaign,
  limitPerRun = 12,
): Promise<OsmDiscoveryResult> {
  const result: OsmDiscoveryResult = { created: 0, seen: 0, queries: [], skipped: 0 };

  const sectoren = campaign.targetSectors.length ? campaign.targetSectors : STANDAARD_SECTOREN;
  const steden = campaign.targetCities.length ? campaign.targetCities : [""];

  const vragen: string[] = [];
  for (const s of sectoren) {
    for (const c of steden) {
      const q = [s, c].filter(Boolean).join(" ").trim();
      if (q.length >= 3) vragen.push(q);
    }
  }
  // Eén ronde blijft klein: OpenStreetMap wil hooguit één aanvraag per seconde
  // (de wachtrij in lib/integrations/osm-plaatsen.ts bewaakt dat).
  const ronde = vragen.slice(0, 4);
  result.queries = ronde;

  for (const q of ronde) {
    if (result.created >= limitPerRun) break;
    const treffers = await osmZoekBedrijven(q, { aantal: 10 }).catch((err: unknown) => {
      logger.warn("osm discovery mislukt", { q, error: (err as Error).message });
      return [];
    });
    for (const t of treffers) {
      if (result.created >= limitPerRun) break;
      result.seen += 1;
      if (!t.naam.trim()) {
        result.skipped += 1;
        continue;
      }
      // ontdubbelen op naam + plaats, want OSM heeft geen KVK-nummer
      const bestaat = await prisma.salesLead.findFirst({
        where: {
          companyName: { equals: t.naam, mode: "insensitive" },
          ...(t.plaats ? { city: { equals: t.plaats, mode: "insensitive" } } : {}),
        },
        select: { id: true },
      });
      if (bestaat) {
        result.skipped += 1;
        continue;
      }
      await createLead({
        companyName: t.naam,
        city: t.plaats ?? undefined,
        sector: q.split(" ")[0] ?? "",
        source: "openstreetmap",
        createdById: null,
        campaignId: campaign.id,
        ...(t.website ? { sourceUrl: t.website } : {}),
        ...(t.telefoon ? { contactPhone: t.telefoon } : {}),
      });
      result.created += 1;
    }
  }

  logger.info("osm discovery run", { campaign: campaign.id, ...result });
  return result;
}
