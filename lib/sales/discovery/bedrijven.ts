import type { SalesCampaign } from "@prisma/client";
import { logger } from "@/lib/logger";
import { isKvkBaseEnabled } from "@/lib/integrations/kvkbase";
import { gebruikEigenVers } from "@/lib/gratis/keuzes";
import { discoverViaKvkBase } from "@/lib/sales/discovery/kvkbase";
import { discoverViaOsm } from "@/lib/sales/discovery/osm";
import { achtergrondMag } from "@/lib/kvk/tegoed";
import { leesKvkTegoed } from "@/lib/kvk/tegoed-opslag";

// ---------------------------------------------------------------------------
// Welke bron vindt de bedrijven voor een campagne?
//
//   onze eigen bron  OpenStreetMap — gratis, geen tegoed, geen KVK-nummer
//   betaalde bron    het Handelsregister via KVKBase — rekent per opvraging af
//
// Dat staat ingesteld bij Admin → Alles gratis ("Bedrijven zoeken voor de
// buitendienst"), standaard onze eigen bron. 6 november liep het KVK-tegoed
// twaalf keer tegen zijn limiet aan terwijl het zoeken zelf ook gratis kan.
// ---------------------------------------------------------------------------

export interface DiscoveryUitkomst {
  bron: "openstreetmap" | "kvkbase";
  created: number;
  seen: number;
  queries: string[];
  skipped: number;
}

export async function discoverBedrijven(
  campaign: SalesCampaign,
  limitPerRun = 12,
): Promise<DiscoveryUitkomst> {
  const eigen = await gebruikEigenVers("sales-bedrijven", isKvkBaseEnabled());
  // ook op "betaald" alleen met een bekend tegoed ruim boven de reserve voor de KVK-controles van werkers en werkgevers
  // (13 nov 2026: het gratis tegoed was op en elke controle faalde; lib/kvk/tegoed.ts)
  if (eigen || !achtergrondMag(await leesKvkTegoed(), limitPerRun)) {
    const uit = await discoverViaOsm(campaign, limitPerRun);
    return { bron: "openstreetmap", ...uit };
  }
  const uit = await discoverViaKvkBase(campaign, limitPerRun);
  // Niets gevonden bij de betaalde bron (tegoed op, limiet bereikt)? Dan alsnog
  // onze eigen bron, zodat een ronde nooit leeg blijft.
  if (uit.created === 0 && uit.seen === 0) {
    logger.info("bedrijven zoeken: kvkbase gaf niets, we kijken bij onze eigen bron");
    const eigenUit = await discoverViaOsm(campaign, limitPerRun);
    return { bron: "openstreetmap", ...eigenUit };
  }
  return { bron: "kvkbase", ...uit };
}
