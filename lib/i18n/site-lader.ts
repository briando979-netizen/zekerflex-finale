import type { Locale } from "@/lib/i18n/config";
import { SITE_LADERS } from "@/lib/i18n/gen/site-index";
import type { SiteVertaling } from "@/lib/i18n/site";

// ---------------------------------------------------------------------------
// De vertaling van de openbare site laden (28 nov 2026, zie lib/i18n/site.ts). Alleen de server roept dit aan
// (getSiteT in lib/i18n/server.ts): de bestanden per taal komen nooit in een browserbundel. Per zin geldt: de eigen taal,
// anders het Engels, anders blijft het Nederlands staan. Faalt het laden, dan is de pagina gewoon Nederlands.
// Een cache per bundel is genoeg: het is alleen een kopie van een vast bestand.
// ---------------------------------------------------------------------------

const cache = new Map<string, SiteVertaling>();

async function laadEen(taal: string): Promise<SiteVertaling | undefined> {
  const lader = Object.hasOwn(SITE_LADERS, taal) ? SITE_LADERS[taal] : undefined;
  if (!lader) return undefined;
  try {
    return (await lader()).vertaling;
  } catch {
    return undefined;
  }
}

export async function laadSiteVertaling(locale: Locale): Promise<SiteVertaling | undefined> {
  if (locale === "nl") return undefined;
  const taal: string = locale;
  const gecachet = cache.get(taal);
  if (gecachet) return gecachet;
  const eigen = await laadEen(taal);
  // Engels als tweede keus voor een zin die in de eigen taal (nog) ontbreekt
  const engels = taal === "en" ? undefined : await laadEen("en");
  if (!eigen && !engels) return undefined;
  const samen: SiteVertaling = { ...(engels ?? {}), ...(eigen ?? {}) };
  cache.set(taal, samen);
  return samen;
}
