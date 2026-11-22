// ---------------------------------------------------------------------------
// Publiek = alleen flexwerk (vlag `publiek-alleen-flexwerk`, lib/flags).
//
// Eén bron van waarheid voor wat er, als de vlag AAN staat, uit het openbare
// zicht verdwijnt: niet-flexwerk-pijlers (online tools, branche-software),
// niet-flexwerk-menuknoppen (aanbod, prijzen), de losse product-dashboards (website,
// webshop, horeca, rijschool) en de vaste niet-flexwerk-pagina's.
//
// Dit bestand bepaalt waar ze NIET meer naartoe gelinkt worden (menu, voorpagina,
// voettekst), waar ze uit de sitemap/rondgang vallen en waar ze op noindex komen.
// Sinds 22 nov 2026 zijn de oude verkooppagina's en hulpmiddelen (apps, websites,
// logo, advertentie, domein, website- en reviewcheck, rijschool-software,
// partnerplatform, producten, abonnementen) en de webshop helemaal uit de code; hun
// oude adressen sturen door naar /bedrijven, /app of de voorpagina
// (next.config.mjs; eigenaar: "verwijder de shop en apps enzo", en niemand gebruikte
// ze). /aanbod zelf en de flexwerk-onderdelen in deze lijst (developers,
// open-diensten, partnerpagina's) blijven via een directe link bereikbaar.
//
// Puur en browser-veilig (geen prisma/kv): het menu (client) en de server lezen
// er allebei uit. De vlag zelf lees je met `featureEnabled(FLAG_ALLEEN_FLEXWERK)`
// op de server (lib/seo/verbergen.ts), nooit vanuit dit pure bestand.
// ---------------------------------------------------------------------------

import { type PijlerSleutel } from "@/lib/marketing/aanbod";

/** De runtime feature-vlag (lib/flags). Standaard UIT; de hoofdsessie zet hem na de uitrol AAN. */
export const FLAG_ALLEEN_FLEXWERK = "publiek-alleen-flexwerk";

/** Pijlers in het aanbod die niet over flexwerk gaan: online tools en branche-software. */
export const NIET_FLEXWERK_PIJLERS: readonly PijlerSleutel[] = ["online", "branche"];

/** Gaat deze pijler over flexwerk (personeel, geld)? */
export function pijlerIsFlexwerk(sleutel: PijlerSleutel): boolean {
  return !NIET_FLEXWERK_PIJLERS.includes(sleutel);
}

/** Hoofdmenu-knoppen (lib/marketing/site-nav.ts) die niet over flexwerk gaan. "aanbod" = de brede Aanbod-uitklap. */
// 21 nov 2026 (eigenaar: "prijzen ook weg"): de knop Prijzen ook uit het menu; tarievenoverzicht en rekenhulp staan onder Kennis.
// 22 nov 2026: de knoppen Shop en Apps & spelletjes bestaan niet meer (een bewaarde eigen menuversie laat ze ook vallen).
export const NIET_FLEXWERK_NAV_KEYS: readonly string[] = ["aanbod", "prijzen"];

/** Werkruimte-soorten die niet over flexwerk gaan (de losse product-dashboards). "personeel" blijft. */
export const NIET_FLEXWERK_SOORTEN: readonly string[] = ["website", "webshop", "horeca", "rijschool"];

/** Is dit bedrijfsdashboard/werkruimte-soort flexwerk (personeel)? */
export function werkruimteIsFlexwerk(soort: string): boolean {
  return !NIET_FLEXWERK_SOORTEN.includes(soort);
}

/**
 * Openbare paden die niet over flexwerk gaan. Als de vlag aan is vallen ze uit menu, voorpagina, voettekst, sitemap en
 * de nachtelijke rondgang, en komen ze op noindex. Een subpad (bv. /developers/api) valt vanzelf mee.
 * De bovenste groep is op 22 nov 2026 uit de code gehaald (next.config.mjs stuurt de oude adressen door). Die paden
 * blijven hier: /sitemap-verwijderd.xml (lib/seo/verwijderd.ts) vraagt Google ze opnieuw op te halen, en links ernaar die
 * nog in het aanbod (de pijlers online en branche) of in een bewaarde eigen voettekst staan, blijven verborgen.
 * De andere paden bestaan nog en zijn via een directe link bereikbaar.
 */
export const NIET_FLEXWERK_PADEN: readonly string[] = [
  // weg sinds 22 nov 2026
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
  "/nieuwe-home",
  "/abonnementen",
  "/voorbeeldsites",
  // bestaan nog, verborgen
  "/developers",
  // de klussen-kaart (en de 3D-variant). De bezoeker ziet de kaart pas na het aanmelden.
  "/open-diensten",
  // de partnerpagina's in de voettekst (eigenaar 20 nov: "Voor bureaus (white-label)" en "Word sales-partner (commissie)" weg)
  "/voor-bureaus",
  "/sales-partner",
  // het hele aanbod: de overzichtspagina én elke /aanbod/<slug>-functiepagina (inchecken, roosterplanner,
  // spoedoproep, facturen, …). De eigenaar wil "aanbod verbergen inclusief wat er is" en "de functies weg";
  // de kern-flexwerk-SEO blijft gedekt door /personeel-inhuren, /uitzendbureau en de sector-/stadpagina's.
  "/aanbod",
  // de proefversie van het voorpagina-herontwerp van 19 nov (teruggedraaid): de losse flexwerk-home (de brede home,
  // /nieuwe-home, staat hierboven). De eigenaar wil hem dicht (20 nov).
  "/flexwerk",
];

/**
 * Paden die alleen EXACT verborgen zijn, niet hun subpaden:
 * - "/klussen": de blader-/zoeklijst valt weg, maar de losse klus-advertenties /klussen/<id> BLIJVEN vindbaar in Google
 *   Vacatures (JobPosting): ze houden hun noindex-vrije metadata en blijven in de sitemap (besluit eigenaar).
 * (/aanbod zit in NIET_FLEXWERK_PADEN als voorvoegsel: de overzichtspagina én alle /aanbod/<slug>-functiepagina's.)
 */
export const NIET_FLEXWERK_EXACT: readonly string[] = ["/klussen"];

/** Hoort dit pad bij een niet-flexwerk-onderdeel (exact pad of een subpad ervan; of een exact-pad uit NIET_FLEXWERK_EXACT)? */
export function isNietFlexwerkPad(pad: string): boolean {
  const schoon = (pad.split(/[?#]/)[0] ?? pad).replace(/\/+$/, "") || "/";
  if (NIET_FLEXWERK_EXACT.includes(schoon)) return true;
  return NIET_FLEXWERK_PADEN.some((basis) => schoon === basis || schoon.startsWith(`${basis}/`));
}

/**
 * Regels in de lopende band op /bedrijven (tekstregister "marquee.items") die niet over flexwerk gaan. De eigenaar
 * bewerkt die band zelf (Admin → Huisstijl → Teksten), dus we matchen op de tekst: zo'n regel valt met de vlag aan
 * weg, ook als hij in een eigen versie van de band staat (20 nov: "Meer Google-reviews" stond nog in beeld).
 */
export const NIET_FLEXWERK_BAND: readonly string[] = ["Software voor horeca en rijscholen", "Een eigen website op je domein", "Meer Google-reviews"];

/** De band zonder de niet-flexwerk-regels als de vlag aan is; anders ongewijzigd. */
export function zichtbareBandRegels(regels: readonly string[], alleenFlexwerk: boolean): string[] {
  return alleenFlexwerk ? regels.filter((r) => !NIET_FLEXWERK_BAND.includes(r.trim())) : [...regels];
}

/** Alleen de flexwerk-pijlers houden als de vlag aan is; anders de lijst ongewijzigd. */
export function zichtbarePijlers<T extends { sleutel: PijlerSleutel }>(pijlers: readonly T[], alleenFlexwerk: boolean): T[] {
  return alleenFlexwerk ? pijlers.filter((p) => pijlerIsFlexwerk(p.sleutel)) : [...pijlers];
}
