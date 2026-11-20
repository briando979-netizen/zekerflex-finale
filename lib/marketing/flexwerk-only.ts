// ---------------------------------------------------------------------------
// Publiek = alleen flexwerk (vlag `publiek-alleen-flexwerk`, lib/flags).
//
// Eén bron van waarheid voor wat er, als de vlag AAN staat, uit het openbare
// zicht verdwijnt: niet-flexwerk-pijlers (online tools, branche-software),
// niet-flexwerk-menu's (shop, apps), de losse product-dashboards (website,
// webshop, horeca, rijschool) en de vaste niet-flexwerk-pagina's.
//
// Belangrijk: de pagina's BLIJVEN bestaan en zijn via een directe link
// bereikbaar (geen 404, geen redirect). Dit bestand bepaalt alleen waar ze NIET
// meer naartoe gelinkt worden (menu, voorpagina, voettekst), waar ze uit de
// sitemap/rondgang vallen en waar ze op noindex komen.
//
// Puur en browser-veilig (geen prisma/kv): het menu (client) en de server lezen
// er allebei uit. De vlag zelf lees je met `featureEnabled(FLAG_ALLEEN_FLEXWERK)`
// op de server (lib/seo/verbergen.ts), nooit vanuit dit pure bestand.
// ---------------------------------------------------------------------------

import { AANBOD, type PijlerSleutel } from "@/lib/marketing/aanbod";

/** De runtime feature-vlag (lib/flags). Standaard UIT; de hoofdsessie zet hem na de uitrol AAN. */
export const FLAG_ALLEEN_FLEXWERK = "publiek-alleen-flexwerk";

/** Pijlers in het aanbod die niet over flexwerk gaan: online tools en branche-software. */
export const NIET_FLEXWERK_PIJLERS: readonly PijlerSleutel[] = ["online", "branche"];

/** Gaat deze pijler over flexwerk (personeel, geld)? */
export function pijlerIsFlexwerk(sleutel: PijlerSleutel): boolean {
  return !NIET_FLEXWERK_PIJLERS.includes(sleutel);
}

/** Hoofdmenu-knoppen (lib/marketing/site-nav.ts) die niet over flexwerk gaan. "aanbod" = de brede Aanbod-uitklap. */
export const NIET_FLEXWERK_NAV_KEYS: readonly string[] = ["shop", "apps", "aanbod"];

/** Werkruimte-soorten die niet over flexwerk gaan (de losse product-dashboards). "personeel" blijft. */
export const NIET_FLEXWERK_SOORTEN: readonly string[] = ["website", "webshop", "horeca", "rijschool"];

/** Is dit bedrijfsdashboard/werkruimte-soort flexwerk (personeel)? */
export function werkruimteIsFlexwerk(soort: string): boolean {
  return !NIET_FLEXWERK_SOORTEN.includes(soort);
}

/**
 * Vaste openbare pagina's die niet over flexwerk gaan. Als de vlag aan is vallen
 * ze uit menu, voorpagina, voettekst, sitemap en de nachtelijke rondgang, en
 * komen ze op noindex. Ze blijven bestaan en bereikbaar via een directe link.
 * Een subpad (bv. /shop/zakelijk, /developers/api) valt vanzelf mee.
 */
export const NIET_FLEXWERK_PADEN: readonly string[] = [
  "/shop",
  "/producten",
  "/apps",
  "/apps-en-spelletjes",
  "/online",
  "/website-maken",
  "/website-check",
  "/logo-maker",
  "/advertentie-op-maat",
  "/starters",
  "/domeinnaam",
  "/review-check",
  "/rijschool-software",
  "/verkopen",
  "/developers",
  // de publieke klussen-surfaces: de open-klussen-lijst (en elke klus /klussen/<id>) en de klussen-kaart.
  // De bezoeker ziet klussen pas na het aanmelden; /register en de flexwerk-home blijven.
  "/klussen",
  "/open-diensten",
];

/**
 * Paden die alleen EXACT verborgen zijn, niet hun subpaden. "/aanbod" (het hele-aanbod-overzicht) valt weg, maar de losse
 * /aanbod/<slug>-productpagina's volgen hun eigen pijler (flexwerk zichtbaar, online/branche via NIET_FLEXWERK_AANBOD_PADEN).
 */
export const NIET_FLEXWERK_EXACT: readonly string[] = ["/aanbod"];

/** De /aanbod/<slug>-pagina's van de verborgen pijlers (website, webshop, horeca, …): die hebben geen eigen pagina elders. */
const NIET_FLEXWERK_AANBOD_PADEN: readonly string[] = AANBOD.filter(
  (a) => NIET_FLEXWERK_PIJLERS.includes(a.pijler) && !a.pagina,
).map((a) => `/aanbod/${a.slug}`);

/** Hoort dit pad bij een niet-flexwerk-onderdeel (exact pad of een subpad ervan; of een exact-pad uit NIET_FLEXWERK_EXACT)? */
export function isNietFlexwerkPad(pad: string): boolean {
  const schoon = (pad.split(/[?#]/)[0] ?? pad).replace(/\/+$/, "") || "/";
  if (NIET_FLEXWERK_EXACT.includes(schoon)) return true;
  return [...NIET_FLEXWERK_PADEN, ...NIET_FLEXWERK_AANBOD_PADEN].some(
    (basis) => schoon === basis || schoon.startsWith(`${basis}/`),
  );
}

/** Alleen de flexwerk-pijlers houden als de vlag aan is; anders de lijst ongewijzigd. */
export function zichtbarePijlers<T extends { sleutel: PijlerSleutel }>(pijlers: readonly T[], alleenFlexwerk: boolean): T[] {
  return alleenFlexwerk ? pijlers.filter((p) => pijlerIsFlexwerk(p.sleutel)) : [...pijlers];
}
