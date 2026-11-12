// ---------------------------------------------------------------------------
// De officiële bedrijfsgegevens van ZekerFlex, zodat iedereen zelf kan controleren dat het bedrijf echt bestaat
// (12 nov 2026, eigenaar: "zet in de footer de gegevens neer, zodat zij mij kunnen controleren"). Bron: de
// oprichtingsakte van de Delaware Division of Corporations (filed 5 nov 2026, file number 10830906).
// Bewust NIET het adres van de bestuurder (dat is een woonadres): alleen wat in het openbare register van Delaware staat.
// Puur bestand: de footer, de juridische pagina's en de test gebruiken het.
// ---------------------------------------------------------------------------

export const BEDRIJF = {
  /** de juridische naam precies zoals in de oprichtingsakte */
  naam: "zekerflex, Inc.",
  rechtsvorm: "vennootschap naar het recht van Delaware (VS)",
  /** file number bij de Delaware Division of Corporations */
  dossiernummer: "10830906",
  /** ISO-datum van oprichting (filed) */
  opgericht: "2026-11-05",
  /** het officiële adres van het bedrijf in Delaware (registered agent) */
  registeredAgent: "Legalinc Corporate Services Inc.",
  registeredAgentAdres: "131 Continental Dr, Suite 305, Newark, DE 19713, Verenigde Staten",
  /** het openbare bedrijfsregister van Delaware: zoeken op naam of dossiernummer */
  registerUrl: "https://icis.corp.delaware.gov/ecorp/entitysearch/namesearch.aspx",
} as const;
