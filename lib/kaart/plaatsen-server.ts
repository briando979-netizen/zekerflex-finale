import { prisma } from "@/lib/prisma";
import { zoekCoordinaat } from "@/lib/geo/pdok";
import { logger } from "@/lib/logger";
import { horecaSoortNl, type Plaats } from "@/lib/kaart/plaatsen";

// De bedrijven van ZekerFlex op de kaart: horecazaken waarvan de eigenaar de website openbaar heeft gezet
// (HorecaZaak.online). Het adres wordt bij PDOK opgezocht (gratis, Nederlands; PDOK heeft zelf een geheugen)
// en de hele lijst blijft tien minuten staan. Alleen naam, soort, adres en de link naar de eigen site.

const BEWAAR_MS = 10 * 60_000;
const MAX = 300;
const TEGELIJK = 4;

const g = globalThis as unknown as { __zfKaartPlaatsen?: { tot: number; plaatsen: Plaats[] } };

export async function zekerFlexPlaatsen(nu = Date.now()): Promise<Plaats[]> {
  const bewaard = g.__zfKaartPlaatsen;
  if (bewaard && bewaard.tot > nu) return bewaard.plaatsen;

  const zaken = await prisma.horecaZaak.findMany({
    where: { online: true },
    select: { id: true, slug: true, naam: true, soort: true, adres: true, plaats: true },
    orderBy: { createdAt: "desc" },
    take: MAX,
  });

  const plaatsen: Plaats[] = [];
  for (let i = 0; i < zaken.length; i += TEGELIJK) {
    const groep = zaken.slice(i, i + TEGELIJK);
    const uit = await Promise.all(
      groep.map(async (z) => {
        const tekst = [z.adres, z.plaats].map((s) => s.trim()).filter(Boolean).join(", ");
        if (!tekst) return null;
        try {
          const plek = await zoekCoordinaat(tekst);
          if (!plek) return null;
          return { id: z.id, naam: z.naam, soort: horecaSoortNl(z.soort), adres: z.adres, plaats: z.plaats, lat: plek.lat, lon: plek.lon, link: `/horeca/${z.slug}` } satisfies Plaats;
        } catch (err) {
          logger.warn("kaart plaats opzoeken mislukt", { error: (err as Error).message });
          return null;
        }
      }),
    );
    for (const p of uit) if (p) plaatsen.push(p);
  }

  g.__zfKaartPlaatsen = { tot: nu + BEWAAR_MS, plaatsen };
  return plaatsen;
}
