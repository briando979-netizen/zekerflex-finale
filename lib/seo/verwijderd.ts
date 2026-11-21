import { NIET_FLEXWERK_PADEN } from "@/lib/marketing/flexwerk-only";
import { aanbodHref, eigenPaginas } from "@/lib/marketing/aanbod";

// ---------------------------------------------------------------------------
// Pagina's die uit Google moeten (21 nov 2026, eigenaar: "op Google staat nog webshop openen, reviews, website; alleen
// flexwerk en de regio's"). Ze staan al op noindex en niet in de sitemap, maar Google komt er dan zelden langs en houdt
// ze maanden vast. Deze lijst gaat in /sitemap-verwijderd.xml (staat in robots.txt) en naar IndexNow, zodat Google en
// Bing ze snel opnieuw ophalen, de noindex zien en ze weghalen. Puur bestand.
// ---------------------------------------------------------------------------

/** Elk verborgen vast pad plus elke /aanbod/<slug>-pagina, zonder dubbele. */
export function verwijderdePaden(): string[] {
  return [...new Set([...NIET_FLEXWERK_PADEN, ...eigenPaginas().map(aanbodHref)])].sort();
}
