// Domeinnamen die ZekerFlex aanbiedt: de extensies, wat ze ZekerFlex kosten,
// wat de klant betaalt en waar de beschikbaarheid openbaar op te vragen is.
// Puur bestand (ook bruikbaar in client-code).
//
// PRIJZEN (5 nov 2026, eigenaar: "klein winstmodel"): de inkoop komt uit het
// TransIP-account van ZekerFlex (API /v6/tlds, excl. btw). Het register maakt
// het eerste jaar vaak goedkoop en de verlenging duur, dus de klant ziet twee
// prijzen: eerste jaar en daarna per jaar. Verkoop = inkoop + 15%, minstens
// € 2 per jaar, afgerond naar boven op ,95 (verkoopPrijs). Nooit onder de inkoop;
// de dagelijkse ronde waarschuwt als TransIP duurder wordt (lib/domeinen/behoud.ts).
//
// RDAP: de openbare opvraagdienst van het register (uit de IANA-bootstraplijst,
// vast in de code zodat de server nooit een willekeurig adres opvraagt). Waar
// geen RDAP bestaat (.eu, .be, .de, .nu) kijken we in DNS of de naam in gebruik is.

export interface Extensie {
  tld: string;
  /** inkoop eerste jaar bij TransIP, in centen excl. btw */
  inkoopEersteCent: number;
  /** inkoop verlenging per jaar bij TransIP, in centen excl. btw */
  inkoopVerlengCent: number;
  /** verkoop eerste jaar, in centen excl. btw */
  prijsCent: number;
  /** verkoop verlenging per jaar, in centen excl. btw */
  verlengCent: number;
  /** basisadres van de RDAP-dienst, of null (dan DNS-controle) */
  rdap: string | null;
  /** bovenaan in de zoekresultaten */
  populair: boolean;
  omschrijving: string;
}

/** Marge: 15% boven de inkoop, minstens € 2,00. */
export const MARGE_PROCENT = 15;
export const MARGE_MINIMUM_CENT = 200;

/** Inkoop → verkoopprijs: inkoop + marge, naar boven afgerond op hele euro's plus 95 cent. */
export function verkoopPrijs(inkoopCent: number): number {
  const minimaal = Math.max(inkoopCent * (1 + MARGE_PROCENT / 100), inkoopCent + MARGE_MINIMUM_CENT);
  return Math.ceil((minimaal - 95) / 100) * 100 + 95;
}

type Bron = Omit<Extensie, "prijsCent" | "verlengCent">;

const BRON: Bron[] = [
  { tld: "nl", inkoopEersteCent: 49, inkoopVerlengCent: 1650, rdap: "https://rdap.sidn.nl/", populair: true, omschrijving: "Dé extensie voor Nederland" },
  { tld: "com", inkoopEersteCent: 899, inkoopVerlengCent: 2799, rdap: "https://rdap.verisign.com/com/v1/", populair: true, omschrijving: "Wereldwijd de bekendste" },
  { tld: "eu", inkoopEersteCent: 799, inkoopVerlengCent: 2699, rdap: null, populair: true, omschrijving: "Voor heel Europa" },
  { tld: "be", inkoopEersteCent: 699, inkoopVerlengCent: 2199, rdap: null, populair: true, omschrijving: "Voor België" },
  { tld: "net", inkoopEersteCent: 1000, inkoopVerlengCent: 2750, rdap: "https://rdap.verisign.com/net/v1/", populair: false, omschrijving: "Alternatief voor .com" },
  { tld: "org", inkoopEersteCent: 999, inkoopVerlengCent: 2750, rdap: "https://rdap.publicinterestregistry.org/rdap/", populair: false, omschrijving: "Voor verenigingen en stichtingen" },
  { tld: "de", inkoopEersteCent: 1149, inkoopVerlengCent: 2849, rdap: null, populair: false, omschrijving: "Voor Duitsland" },
  { tld: "info", inkoopEersteCent: 2999, inkoopVerlengCent: 2999, rdap: "https://rdap.identitydigital.services/rdap/", populair: false, omschrijving: "Voor informatie en uitleg" },
  { tld: "online", inkoopEersteCent: 99, inkoopVerlengCent: 6499, rdap: "https://rdap.radix.host/rdap/", populair: false, omschrijving: "Voor alles wat online is" },
  { tld: "shop", inkoopEersteCent: 6499, inkoopVerlengCent: 6499, rdap: "https://rdap.gmoregistry.net/rdap/", populair: false, omschrijving: "Voor je webshop" },
  { tld: "store", inkoopEersteCent: 399, inkoopVerlengCent: 10250, rdap: "https://rdap.radix.host/rdap/", populair: false, omschrijving: "Voor je winkel" },
  { tld: "app", inkoopEersteCent: 3699, inkoopVerlengCent: 3699, rdap: "https://pubapi.registry.google/rdap/", populair: false, omschrijving: "Voor apps (altijd https)" },
  { tld: "amsterdam", inkoopEersteCent: 7199, inkoopVerlengCent: 7199, rdap: "https://rdap.nic.amsterdam/", populair: false, omschrijving: "Voor Amsterdam" },
  { tld: "frl", inkoopEersteCent: 7099, inkoopVerlengCent: 7099, rdap: "https://rdap.centralnic.com/frl/", populair: false, omschrijving: "Voor Friesland" },
  { tld: "restaurant", inkoopEersteCent: 9999, inkoopVerlengCent: 9999, rdap: "https://rdap.identitydigital.services/rdap/", populair: false, omschrijving: "Voor je restaurant" },
  { tld: "cafe", inkoopEersteCent: 6499, inkoopVerlengCent: 6499, rdap: "https://rdap.identitydigital.services/rdap/", populair: false, omschrijving: "Voor je café" },
  { tld: "studio", inkoopEersteCent: 4999, inkoopVerlengCent: 4999, rdap: "https://rdap.identitydigital.services/rdap/", populair: false, omschrijving: "Voor je studio of praktijk" },
  { tld: "nu", inkoopEersteCent: 3999, inkoopVerlengCent: 3999, rdap: null, populair: false, omschrijving: "Kort en krachtig" },
];

export const EXTENSIES: Extensie[] = BRON.map((e) => ({ ...e, prijsCent: verkoopPrijs(e.inkoopEersteCent), verlengCent: verkoopPrijs(e.inkoopVerlengCent) }));

/** De bundel: bij een website of webshop van ZekerFlex het eerste jaar inbegrepen. */
export const BUNDEL_TLDS = ["nl", "com", "eu", "be"] as const;

export const extensie = (tld: string): Extensie | undefined => EXTENSIES.find((e) => e.tld === tld);

export const BTW_PROCENT = 21;

/** Prijs excl. btw → btw (afgerond op hele centen) en het totaal. */
export function metBtw(exclCent: number): { exclCent: number; btwCent: number; inclCent: number } {
  const btwCent = Math.round((exclCent * BTW_PROCENT) / 100);
  return { exclCent, btwCent, inclCent: exclCent + btwCent };
}

/** "€ 9,95" */
export const euroPrijs = (cent: number): string => `€ ${(cent / 100).toFixed(2).replace(".", ",")}`;
