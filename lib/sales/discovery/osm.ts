import type { SalesCampaign } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { osmBedrijvenVanSoorten, osmZoekBedrijven, type OsmPlaats } from "@/lib/integrations/osm-plaatsen";
import { STRAAL_M, middelpuntVanStad, tagsVoorSector } from "@/lib/sales/discovery/osm-tags";
import { createLead } from "@/lib/sales/leads";
import { bruikbaarVoorKennismaking } from "@/lib/sales/discovery/rommel-adres";
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
//
// 17 nov 2026: eerst Overpass op kenmerken (shop=*, amenity=restaurant, …) rond
// het middelpunt van de plaats (lib/sales/discovery/osm-tags.ts); Nominatim op
// vrije tekst vond bij "schoonmaak Veendam" bijna niets (ronde 08:00: 0 ontdekt).
// Geeft Overpass niets of faalt hij, dan Nominatim als terugval: de ronde valt
// nooit stil. Hooguit VRAGEN_PER_RONDE vragen per bron per ronde, in de wachtrij
// met pauze van lib/integrations/osm-plaatsen.ts.
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
/** Zoveel bedrijven per Overpass-vraag (ontdubbelen op naam + plaats haalt er de bekende uit). */
const PER_VRAAG = 20;
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
export function osmVraagDelen(sectoren: readonly string[], steden: readonly string[], nu: Date): OsmVraag[] {
  const vragen: OsmVraag[] = [];
  for (const c of steden.length ? steden : [""]) {
    for (const s of sectoren) {
      const q = [s, c].filter(Boolean).join(" ").trim();
      if (q.length >= 3 && !vragen.some((v) => v.q === q)) vragen.push({ sector: s, stad: c, q });
    }
  }
  if (vragen.length <= VRAGEN_PER_RONDE) return vragen;
  const stap = (amsterdamDag(nu) - BEGINDAG) * VRAGEN_PER_RONDE;
  const begin = ((stap % vragen.length) + vragen.length) % vragen.length;
  return Array.from({ length: VRAGEN_PER_RONDE }, (_, i) => vragen[(begin + i) % vragen.length]).filter((v): v is OsmVraag => v !== undefined);
}

/** Eén zoekvraag van de ronde: de sector en de plaats apart (Overpass) en als tekst (Nominatim, log). */
export interface OsmVraag {
  sector: string;
  stad: string;
  q: string;
}

export function osmVragen(sectoren: readonly string[], steden: readonly string[], nu: Date): string[] {
  return osmVraagDelen(sectoren, steden, nu).map((v) => v.q);
}

/**
 * De treffers voor één vraag: Overpass op kenmerken rond het middelpunt van de plaats, en als dat niets geeft (onbekende
 * sector of plaats, storing, leeg) Nominatim op de tekst. Faalt een bron, dan telt dat als "niets" en gaat de ronde door.
 */
async function treffersVoor(v: OsmVraag): Promise<{ treffers: OsmPlaats[]; bron: "overpass" | "nominatim" }> {
  const tags = tagsVoorSector(v.sector);
  const midden = middelpuntVanStad(v.stad);
  if (tags.length && midden) {
    const uit = await osmBedrijvenVanSoorten({ ...midden, radiusM: STRAAL_M, soorten: tags, aantal: PER_VRAAG }).catch((err: unknown) => {
      logger.warn("osm overpass mislukt", { q: v.q, error: (err as Error).message });
      return [];
    });
    if (Array.isArray(uit) && uit.length) return { treffers: uit, bron: "overpass" };
  }
  const uit = await osmZoekBedrijven(v.q, { aantal: 10 }).catch((err: unknown) => {
    logger.warn("osm discovery mislukt", { q: v.q, error: (err as Error).message });
    return [];
  });
  return { treffers: Array.isArray(uit) ? uit : [], bron: "nominatim" };
}

export interface OsmDiscoveryResult {
  created: number;
  seen: number;
  queries: string[];
  skipped: number;
  /** vragen die Overpass (op kenmerken) beantwoordde, en vragen die op Nominatim (tekst) terugvielen */
  overpass: number;
  nominatim: number;
}

export async function discoverViaOsm(
  campaign: SalesCampaign,
  limitPerRun = 12,
  nu: Date = new Date(),
): Promise<OsmDiscoveryResult> {
  const result: OsmDiscoveryResult = { created: 0, seen: 0, queries: [], skipped: 0, overpass: 0, nominatim: 0 };

  const sectoren = campaign.targetSectors.length ? campaign.targetSectors : STANDAARD_SECTOREN;
  const steden = campaign.targetCities.length ? campaign.targetCities : STANDAARD_STEDEN;
  const ronde = osmVraagDelen(sectoren, steden, nu);
  result.queries = ronde.map((v) => v.q);

  for (const v of ronde) {
    if (result.created >= limitPerRun) break;
    const { treffers, bron } = await treffersVoor(v);
    result[bron] += 1;
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
      // Het mailadres dat het bedrijf zelf op de kaart zette (18 nov 2026): dan heeft de lead meteen een adres. Dezelfde
      // regels als de contact-scrape (geen rommel, geen no-reply/privacy/abuse); een gratis maildienst mag hier wel,
      // want het bedrijf maakte dit adres zelf openbaar.
      const email = t.email && bruikbaarVoorKennismaking(t.email) ? t.email : null;
      // Overpass geeft niet altijd een plaats bij het bedrijf: dan de plaats waar we rond zochten
      await createLead({
        companyName: t.naam,
        city: t.plaats ?? (v.stad || undefined),
        sector: v.sector,
        source: "openstreetmap",
        createdById: null,
        campaignId: campaign.id,
        ...(t.website ? { sourceUrl: t.website } : {}),
        ...(t.telefoon ? { contactPhone: t.telefoon } : {}),
        ...(email ? { contactEmail: email, discoveredEmail: email } : {}),
      });
      result.created += 1;
    }
  }

  logger.info("osm discovery run", { campaign: campaign.id, ...result });
  return result;
}
