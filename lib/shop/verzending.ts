// Verzendkosten van de webshop: één bron voor het afrekenen op de site
// (app/api/shop/orders) en de productlijst voor AI-assistenten
// (lib/shop/agent-handel.ts). Puur, zodat beide hetzelfde rekenen.

export const VERZENDKOSTEN_CENT = 495;
export const GRATIS_VERZENDING_VANAF_CENT = 5000;

/** Gratis vanaf € 50 (en bij een lege mand), anders € 4,95. */
export const verzendkostenVoor = (subtotaalCent: number): number =>
  subtotaalCent >= GRATIS_VERZENDING_VANAF_CENT || subtotaalCent === 0 ? 0 : VERZENDKOSTEN_CENT;
