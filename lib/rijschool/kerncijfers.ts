import { prisma } from "@/lib/prisma";
import { saldiVan } from "@/lib/rijschool/store";
import { siteUrl } from "@/lib/rijschool/mail";
import { amsterdamStartOfDay } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// De kerncijfers van een rijschool in een paar lichte queries, voor een
// startscherm of tegel buiten het rijschool-beheer (het beheer zelf gebruikt
// beheerWeergave in lib/rijschool/weergave.ts). Dagen volgen de Nederlandse tijd.
// ---------------------------------------------------------------------------

export interface RijschoolKerncijfers {
  naam: string;
  slug: string;
  /** website publiek zichtbaar */
  online: boolean;
  beheerUrl: string;
  siteUrl: string;
  /** leerlingen met status ACTIEF */
  leerlingenActief: number;
  /** nieuwe aanmeldingen (proefles of handmatig) die nog geen leerling zijn */
  aanmeldingen: number;
  /** geplande lessen vandaag */
  lessenVandaag: number;
  /** geplande lessen van vandaag tot en met over 6 dagen */
  lessenKomendeWeek: number;
  /** lopende leerlingen (actief of aanmelding) met een tegoed onder nul */
  tegoedTekort: number;
  /** openstaande betalingen: aantal en bedrag */
  openBetalingen: number;
  openBetalingenCent: number;
}

/** De kerncijfers van de rijschool van dit bedrijf, of null als het rijschool-pakket niet aanstaat. */
export async function rijschoolKerncijfers(tenantId: string, nu = new Date()): Promise<RijschoolKerncijfers | null> {
  const r = await prisma.rijschool.findUnique({ where: { tenantId }, select: { id: true, naam: true, slug: true, online: true } });
  if (!r) return null;
  const vandaag = amsterdamStartOfDay(nu);
  const morgen = amsterdamStartOfDay(nu, 1);
  const overWeek = amsterdamStartOfDay(nu, 7);
  const gepland = { rijschoolId: r.id, status: "GEPLAND" as const };
  const [statussen, lessenVandaag, lessenKomendeWeek, lopend, open] = await Promise.all([
    prisma.rijschoolLeerling.groupBy({ by: ["status"], where: { rijschoolId: r.id }, _count: { _all: true } }),
    prisma.rijschoolLes.count({ where: { ...gepland, start: { gte: vandaag, lt: morgen } } }),
    prisma.rijschoolLes.count({ where: { ...gepland, start: { gte: vandaag, lt: overWeek } } }),
    prisma.rijschoolLeerling.findMany({ where: { rijschoolId: r.id, status: { in: ["ACTIEF", "AANMELDING"] } }, select: { id: true }, take: 5000 }),
    prisma.rijschoolBetaling.aggregate({ where: { rijschoolId: r.id, status: "OPEN" }, _count: { _all: true }, _sum: { bedragCent: true } }),
  ]);
  const saldi = await saldiVan(lopend.map((l) => l.id));
  const aantal = (s: string) => statussen.find((x) => x.status === s)?._count._all ?? 0;
  return {
    naam: r.naam,
    slug: r.slug,
    online: r.online,
    beheerUrl: "/werkgever/rijschool",
    siteUrl: siteUrl(r),
    leerlingenActief: aantal("ACTIEF"),
    aanmeldingen: aantal("AANMELDING"),
    lessenVandaag,
    lessenKomendeWeek,
    tegoedTekort: lopend.filter((l) => (saldi.get(l.id) ?? 0) < 0).length,
    openBetalingen: open._count._all,
    openBetalingenCent: open._sum.bedragCent ?? 0,
  };
}
