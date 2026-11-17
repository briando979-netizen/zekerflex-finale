// ---------------------------------------------------------------------------
// Warme leads: bedrijven die zelf bij ZekerFlex kwamen (een website-check of
// review-scan aanvroegen, een offerte of rekentool invulden, de AI-beller
// belden, of door een gebruiker werden geïntroduceerd). Zij hebben meestal
// geen campagne en dus geen score, maar horen juist bovenaan de bellijst
// (17 nov 2026: 19 van zulke leads kwamen nergens in voor). Puur bestand.
// ---------------------------------------------------------------------------

/** Bronnen waarbij het bedrijf zelf de eerste stap zette (SalesLead.source). */
export const WARME_BRONNEN = [
  "scan-website",
  "scan-reviews",
  "offerte-inbound",
  "rekentool",
  "ai-beller",
  "ai-belafspraak",
  "demo-request",
  "introductie",
] as const;

export function isWarmeBron(source: string | null | undefined): boolean {
  return (WARME_BRONNEN as readonly string[]).includes(source ?? "");
}

/** Het label op de bellijst voor een warme lead. */
export const WARM_LABEL = "Kwam zelf bij ons";
