import { LOGOS, SFEER_SJABLONEN, SJABLONEN, type LogoInvoer, type LogoNr, type SjabloonId } from "@/lib/logo/regels";
import { kiesTekens } from "@/lib/logo/tekens/trefwoorden";

// Welke negen logo's een aanvraag van versie 2 krijgt. Alleen voor de server (pagina's, routes, tests): de
// trefwoordenlijst hoort niet in de bundel van de browser, dus de pagina geeft de namen door aan het scherm.

/**
 * De negen sjablonen, in volgorde: de set van de sfeer, met als laatste altijd het beeldmerk (een teken bij de naam). Past
 * er een teken bij de woorden van het bedrijf zelf, dan wordt het achtste het embleem (dat teken uitgespaard in een vlak).
 */
export function sjablonenVan(invoer: Pick<LogoInvoer, "naam" | "slogan" | "brancheTekst" | "branche" | "sfeer">): SjabloonId[] {
  const lijst = [...SFEER_SJABLONEN[invoer.sfeer]];
  lijst[8] = "teken";
  if (kiesTekens(invoer).eigen) lijst[7] = "embleem";
  return lijst;
}

/** De logo's van een aanvraag met hun naam: zes vaste bij versie 1, negen per sfeer bij versie 2. */
export function logosVan(logo: { versie?: number | undefined; invoer: Pick<LogoInvoer, "naam" | "slogan" | "brancheTekst" | "branche" | "sfeer"> }): { nr: LogoNr; naam: string; uitleg: string }[] {
  if (logo.versie !== 2) return LOGOS.map((l) => ({ nr: l.nr, naam: l.naam, uitleg: l.uitleg }));
  return sjablonenVan(logo.invoer).map((id, i) => ({ nr: (i + 1) as LogoNr, naam: SJABLONEN[id].naam, uitleg: SJABLONEN[id].uitleg }));
}
