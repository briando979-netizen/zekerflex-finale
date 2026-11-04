import type { Rijschool } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { eigenAdres } from "@/lib/rijschool/domein";
import { isCompTenant } from "@/lib/billing/comp";

// ---------------------------------------------------------------------------
// Vindbaar in Google: welke pagina's van een rijschoolsite in een sitemap horen.
// Alleen de openbare pagina's (de app-schermen staan op noindex), alleen als de
// website online staat, en op het hoofdadres: het eigen domein zodra dat actief
// is (met daar een eigen /sitemap.xml), anders zekerflex.com/rijschool/<naam>
// in de sitemap van ZekerFlex zelf.
// ---------------------------------------------------------------------------

/** De openbare pagina's van de site: de voorpagina en, als die online te plannen is, de proefles. */
export function openbarePaden(r: Pick<Rijschool, "proeflesOnline">): string[] {
  return r.proeflesOnline ? ["", "/proefles"] : [""];
}

/** De volledige adressen, gelijk aan de canonical van elke pagina (eigen domein of zekerflex.com). */
export function openbareUrls(r: Pick<Rijschool, "slug" | "proeflesOnline">, eigen: string | null, zekerflex: string): string[] {
  const basis = eigen ?? `${zekerflex}/rijschool/${r.slug}`;
  return openbarePaden(r).map((p) => (p ? `${basis}${p}` : eigen ? `${eigen}/` : basis));
}

const xmlVeilig = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Een sitemap volgens sitemaps.org. */
export function sitemapXml(urls: readonly string[], bijgewerkt: Date): string {
  const regels = urls.map((u) => `  <url><loc>${xmlVeilig(u)}</loc><lastmod>${bijgewerkt.toISOString()}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${regels.join("\n")}\n</urlset>\n`;
}

/**
 * Voor de sitemap van zekerflex.com: de pagina's van online rijscholen zonder
 * actief eigen domein (dat heeft zijn eigen sitemap). Kosteloze accounts (de
 * eigenaar zelf, om te testen) blijven erbuiten.
 */
export async function rijschoolPadenVoorSitemap(): Promise<{ pad: string; bijgewerkt: Date }[]> {
  const scholen = await prisma.rijschool.findMany({
    where: { online: true },
    select: { id: true, slug: true, tenantId: true, proeflesOnline: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
    take: 5000,
  });
  const uit: { pad: string; bijgewerkt: Date }[] = [];
  for (const r of scholen) {
    if ((await eigenAdres(r.id)) || (await isCompTenant(r.tenantId))) continue;
    for (const p of openbarePaden(r)) uit.push({ pad: `/rijschool/${r.slug}${p}`, bijgewerkt: r.updatedAt });
  }
  return uit;
}
