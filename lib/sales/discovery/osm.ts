import type { SalesCampaign } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { osmZoekBedrijven } from "@/lib/integrations/osm-plaatsen";
import { createLead } from "@/lib/sales/leads";
import { CITIES, REGIO_STEDEN } from "@/lib/seo-cities";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

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

/** Noemt de campagne geen steden: eerst Groningen en de regio rond de eigen vestiging, dan de andere steden met een eigen pagina. */
const VOORRANG: readonly string[] = ["groningen", ...REGIO_STEDEN];
export const STANDAARD_STEDEN: readonly string[] = [
  ...VOORRANG.flatMap((slug) => CITIES.filter((c) => c.slug === slug).map((c) => c.name)),
  ...CITIES.filter((c) => !VOORRANG.includes(c.slug)).map((c) => c.name),
];

/** Eén ronde blijft klein: OpenStreetMap wil hooguit één aanvraag per seconde (de wachtrij in lib/integrations/osm-plaatsen.ts bewaakt dat). */
const VRAGEN_PER_RONDE = 4;
/** De Amsterdamse dag waarop het venster bij de eerste vraag staat (15 nov 2026: Groningen). */
const BEGINDAG = Date.UTC(2026, 10, 15) / 86_400_000;

function amsterdamDag(nu: Date): number {
  const [y, m, d] = amsterdamDayKey(nu).split("-").map(Number);
  return Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/**
 * De zoekvragen van de ronde op deze dag. Tot 14 nov 2026 vroeg hij elke dag de eerste vier (horeca, logistiek, retail,
 * schoonmaak, zonder stad), met steeds dezelfde tien treffers: na drie dagen (35 leads) was alles een dubbel en kwam er
 * elke dag 0 uit. Nu schuift het venster elke dag vier vragen op, zonder opgeslagen staat, en na de laatste begint hij
 * weer vooraan. Per stad alle sectoren, zodat de steden met voorrang ook het eerst langskomen.
 */
export function osmVragen(sectoren: readonly string[], steden: readonly string[], nu: Date): string[] {
  const vragen: string[] = [];
  for (const c of steden.length ? steden : [""]) {
    for (const s of sectoren) {
      const q = [s, c].filter(Boolean).join(" ").trim();
      if (q.length >= 3 && !vragen.includes(q)) vragen.push(q);
    }
  }
  if (vragen.length <= VRAGEN_PER_RONDE) return vragen;
  const stap = (amsterdamDag(nu) - BEGINDAG) * VRAGEN_PER_RONDE;
  const begin = ((stap % vragen.length) + vragen.length) % vragen.length;
  return Array.from({ length: VRAGEN_PER_RONDE }, (_, i) => vragen[(begin + i) % vragen.length] ?? "");
}

export interface OsmDiscoveryResult {
  created: number;
  seen: number;
  queries: string[];
  skipped: number;
}

export async function discoverViaOsm(
  campaign: SalesCampaign,
  limitPerRun = 12,
  nu: Date = new Date(),
): Promise<OsmDiscoveryResult> {
  const result: OsmDiscoveryResult = { created: 0, seen: 0, queries: [], skipped: 0 };

  const sectoren = campaign.targetSectors.length ? campaign.targetSectors : STANDAARD_SECTOREN;
  const steden = campaign.targetCities.length ? campaign.targetCities : STANDAARD_STEDEN;
  const ronde = osmVragen(sectoren, steden, nu);
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
