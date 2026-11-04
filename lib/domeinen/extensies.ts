// Domeinnamen die ZekerFlex aanbiedt: de extensies, de prijs per jaar en waar
// de beschikbaarheid openbaar op te vragen is. Puur bestand (ook bruikbaar in
// client-code).
//
// PRIJZEN: voorstel van 4 nov (eigenaar vroeg om "een mooie realistische
// prijs"), excl. btw, per jaar. Ruim boven de inkoop bij TransIP; nieuwe
// extensies (zoals .online en .shop) zijn bij de verlenging duurder, dus die
// staan hoger. Pas ze hier aan; alles leest uit deze lijst.
//
// RDAP: de openbare opvraagdienst van het register (uit de IANA-bootstraplijst,
// vast in de code zodat de server nooit een willekeurig adres opvraagt). Waar
// geen RDAP bestaat (.eu, .be, .de, .nu) kijken we in DNS of de naam in gebruik is.

export interface Extensie {
  tld: string;
  /** prijs per jaar in centen, excl. btw */
  prijsCent: number;
  /** basisadres van de RDAP-dienst, of null (dan DNS-controle) */
  rdap: string | null;
  /** bovenaan in de zoekresultaten */
  populair: boolean;
  omschrijving: string;
}

export const EXTENSIES: Extensie[] = [
  { tld: "nl", prijsCent: 995, rdap: "https://rdap.sidn.nl/", populair: true, omschrijving: "Dé extensie voor Nederland" },
  { tld: "com", prijsCent: 1495, rdap: "https://rdap.verisign.com/com/v1/", populair: true, omschrijving: "Wereldwijd de bekendste" },
  { tld: "eu", prijsCent: 995, rdap: null, populair: true, omschrijving: "Voor heel Europa" },
  { tld: "be", prijsCent: 1195, rdap: null, populair: true, omschrijving: "Voor België" },
  { tld: "net", prijsCent: 1795, rdap: "https://rdap.verisign.com/net/v1/", populair: false, omschrijving: "Alternatief voor .com" },
  { tld: "org", prijsCent: 1795, rdap: "https://rdap.publicinterestregistry.org/rdap/", populair: false, omschrijving: "Voor verenigingen en stichtingen" },
  { tld: "de", prijsCent: 1095, rdap: null, populair: false, omschrijving: "Voor Duitsland" },
  { tld: "info", prijsCent: 2495, rdap: "https://rdap.identitydigital.services/rdap/", populair: false, omschrijving: "Voor informatie en uitleg" },
  { tld: "online", prijsCent: 3995, rdap: "https://rdap.radix.host/rdap/", populair: false, omschrijving: "Voor alles wat online is" },
  { tld: "shop", prijsCent: 4495, rdap: "https://rdap.gmoregistry.net/rdap/", populair: false, omschrijving: "Voor je webshop" },
  { tld: "store", prijsCent: 5995, rdap: "https://rdap.radix.host/rdap/", populair: false, omschrijving: "Voor je winkel" },
  { tld: "app", prijsCent: 2495, rdap: "https://pubapi.registry.google/rdap/", populair: false, omschrijving: "Voor apps (altijd https)" },
  { tld: "amsterdam", prijsCent: 4995, rdap: "https://rdap.nic.amsterdam/", populair: false, omschrijving: "Voor Amsterdam" },
  { tld: "frl", prijsCent: 3995, rdap: "https://rdap.centralnic.com/frl/", populair: false, omschrijving: "Voor Friesland" },
  { tld: "restaurant", prijsCent: 5995, rdap: "https://rdap.identitydigital.services/rdap/", populair: false, omschrijving: "Voor je restaurant" },
  { tld: "cafe", prijsCent: 4995, rdap: "https://rdap.identitydigital.services/rdap/", populair: false, omschrijving: "Voor je café" },
  { tld: "studio", prijsCent: 3495, rdap: "https://rdap.identitydigital.services/rdap/", populair: false, omschrijving: "Voor je studio of praktijk" },
  { tld: "nu", prijsCent: 2995, rdap: null, populair: false, omschrijving: "Kort en krachtig" },
];

/** De bundel: bij een website of webshop van ZekerFlex het eerste jaar inbegrepen. */
export const BUNDEL_TLDS = ["nl", "com", "eu", "be"] as const;

export const extensie = (tld: string): Extensie | undefined => EXTENSIES.find((e) => e.tld === tld);

/** "€ 9,95" */
export const euroPrijs = (cent: number): string => `€ ${(cent / 100).toFixed(2).replace(".", ",")}`;
