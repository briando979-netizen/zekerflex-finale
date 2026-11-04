import { prisma } from "@/lib/prisma";
import { amsterdamDayKey, amsterdamStartOfDay } from "@/lib/time/amsterdam";
import { siteOfTenant } from "@/lib/sites/store";
import { bestellingenVan } from "@/lib/sites/bestellingen";
import { siteStats } from "@/lib/sites/stats";

// ---------------------------------------------------------------------------
// Kerncijfers voor de startschermen van de werkruimtes horeca en website, in een
// paar lichte, alleen-lezende queries. Het rijschool-scherm gebruikt
// rijschoolKerncijfers (lib/rijschool/kerncijfers.ts). Dagen volgen de
// Nederlandse tijd; de server draait in UTC.
// ---------------------------------------------------------------------------

export interface HorecaCijfers {
  naam: string;
  slug: string;
  online: boolean;
  modules: string[];
  /** bevestigde of al aangekomen reserveringen vandaag */
  reserveringenVandaag: number;
  gastenVandaag: number;
  /** bestellingen die nog niet geserveerd of geannuleerd zijn */
  openBestellingen: number;
  /** omzet van de bestellingen van vandaag (zonder geannuleerde) */
  omzetVandaagCent: number;
  menuItems: number;
  uitverkocht: number;
  tafels: number;
}

/** De cijfers van de horecazaak van dit bedrijf, of null als het horeca-pakket niet aanstaat. */
export async function horecaCijfers(tenantId: string, nu = new Date()): Promise<HorecaCijfers | null> {
  const z = await prisma.horecaZaak.findUnique({ where: { tenantId }, select: { id: true, naam: true, slug: true, online: true, modules: true } });
  if (!z) return null;
  const [reserveringen, openBestellingen, omzet, menuItems, uitverkocht, tafels] = await Promise.all([
    prisma.horecaReservering.aggregate({
      where: { zaakId: z.id, datum: amsterdamDayKey(nu), status: { in: ["BEVESTIGD", "AANGEKOMEN"] } },
      _count: { _all: true },
      _sum: { personen: true },
    }),
    prisma.horecaBestelling.count({ where: { zaakId: z.id, status: { in: ["NIEUW", "IN_BEREIDING", "KLAAR"] } } }),
    prisma.horecaBestelling.aggregate({
      where: { zaakId: z.id, createdAt: { gte: amsterdamStartOfDay(nu) }, status: { not: "GEANNULEERD" } },
      _sum: { totaalCent: true },
    }),
    prisma.horecaItem.count({ where: { zaakId: z.id } }),
    prisma.horecaItem.count({ where: { zaakId: z.id, beschikbaar: false } }),
    prisma.horecaTafel.count({ where: { zaakId: z.id, actief: true } }),
  ]);
  return {
    naam: z.naam,
    slug: z.slug,
    online: z.online,
    modules: z.modules,
    reserveringenVandaag: reserveringen._count._all,
    gastenVandaag: reserveringen._sum.personen ?? 0,
    openBestellingen,
    omzetVandaagCent: omzet._sum.totaalCent ?? 0,
    menuItems,
    uitverkocht,
    tafels,
  };
}

export interface WebsiteCijfers {
  naam: string;
  slug: string;
  /** gepubliceerd: bezoekers zien de site */
  online: boolean;
  paginas: number;
  producten: number;
  /** bestellingen met status "nieuw" */
  nieuweBestellingen: number;
  /** binnenkomende bezoekers in de laatste 7 dagen (lib/sites/stats.ts) */
  bezoekers7d: number;
  weergaven7d: number;
}

/** De cijfers van de website van dit bedrijf, of null als er nog geen site is. */
export async function websiteCijfers(tenantId: string, nu = new Date()): Promise<WebsiteCijfers | null> {
  const site = await siteOfTenant(tenantId).catch(() => null);
  if (!site) return null;
  const [bestellingen, stats] = await Promise.all([
    site.winkel ? bestellingenVan(site.id).catch(() => []) : Promise.resolve([]),
    siteStats(site.id, 7, nu).catch(() => null),
  ]);
  return {
    naam: site.bedrijf.naam,
    slug: site.slug,
    online: Boolean(site.liveBuild),
    paginas: site.pages.length,
    producten: site.winkel?.producten.length ?? 0,
    nieuweBestellingen: bestellingen.filter((b) => b.status === "nieuw").length,
    bezoekers7d: stats?.entries ?? 0,
    weergaven7d: stats?.views ?? 0,
  };
}
