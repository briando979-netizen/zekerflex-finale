import type { Metadata } from "next";
import { SITE, canonical } from "@/lib/seo";
import { WIN_OG_LOCALE, WIN_PADEN, WIN_TALEN, WIN_TEKST, winHreflang, type WinTaal } from "@/lib/marketing/werken-in-nederland";

/**
 * Metadata van een "Werken in Nederland"-pagina: eigen titel en beschrijving in die taal, canonical naar zichzelf en
 * hreflang naar de andere vier talen plus x-default (Engels). Zo toont Google in Polen de Poolse versie en in Roemenië de
 * Roemeense, en ziet hij de vijf niet als dubbele inhoud.
 */
export function winMetadata(taal: WinTaal): Metadata {
  const t = WIN_TEKST[taal];
  const basis = canonical(WIN_PADEN[taal], { title: t.title, description: t.description });
  return {
    title: t.title,
    description: t.description,
    alternates: { ...basis.alternates, languages: winHreflang(SITE.url) },
    openGraph: {
      ...basis.openGraph,
      locale: WIN_OG_LOCALE[taal],
      alternateLocale: WIN_TALEN.filter((x) => x !== taal).map((x) => WIN_OG_LOCALE[x]),
    },
  };
}
