// ---------------------------------------------------------------------------
// "Weg naar winst" (Beheer → Geld, 13 nov 2026). De eigenaar: "ZekerFlex moet winstgevend worden". Financiën toont de omzet
// per maand en Kosten de lasten; deze pagina zegt in gewone taal waar ZekerFlex staat op de weg naar de eerste betalende
// klant, wat er nodig is om de vaste kosten te dekken, en wat de volgende stap is en wie die zet.
// Puur bestand: de regels. De cijfers haalt de pagina zelf op; er staat nergens een schatting of een verzonnen getal.
// ---------------------------------------------------------------------------

export interface WinstStand {
  /** kan ZekerFlex betalingen ontvangen? null = nog niet gemeten */
  betalen: boolean | null;
  /** betaalde facturen en betaalde webshopbestellingen samen, laatste 30 dagen, in centen */
  omzet30Cents: number;
  /** alles wat ooit betaald is, in centen */
  omzetOoitCents: number;
  /** vaste kosten per maand excl. btw uit Beheer → Kosten; null = daar nog niet ingevuld */
  kostenMaandCents: number | null;
  werkers: number;
  werkersGeverifieerd: number;
  /** bedrijven zonder het eigen testbedrijf */
  bedrijven: number;
  /** klussen van die bedrijven, ooit geplaatst */
  echteKlussen: number;
  /** goedgekeurde urenstaten, ooit */
  urenstaten: number;
  /** bedrijven met een lopend abonnement op website-beheer */
  websiteKlanten: number;
}

/** Wat er per maand nodig is om de vaste kosten te dekken, per inkomstenlijn apart. Naar boven afgerond. */
export function nodigVoorKosten(kostenMaandCents: number | null, feePerUurCents: number, websitePerMaandCents: number): { uren: number; websites: number } | null {
  if (kostenMaandCents === null || kostenMaandCents <= 0 || feePerUurCents <= 0 || websitePerMaandCents <= 0) return null;
  return { uren: Math.ceil(kostenMaandCents / feePerUurCents), websites: Math.ceil(kostenMaandCents / websitePerMaandCents) };
}

export interface WinstStap {
  id: string;
  titel: string;
  uitleg: string;
  /** wie de stap zet: de eigenaar zelf, of ZekerFlex (de software en de sessies) */
  wie: "jij" | "ZekerFlex";
  klaar: boolean;
  href: string;
  knop: string;
}

/** De stappen naar winst, in vaste volgorde; de eerste die niet klaar is, is de stap van nu. */
export function winstStappen(s: WinstStand): WinstStap[] {
  return [
    {
      id: "betalen",
      titel: "Geld kunnen ontvangen",
      uitleg: "Zolang het betaalaccount dicht staat kan geen bedrijf een factuur of abonnement betalen en geen klant iets kopen. Dit gaat vóór alles.",
      wie: "jij",
      klaar: s.betalen === true,
      href: "/admin/te-doen",
      knop: "Naar Te doen",
    },
    {
      id: "opdrachtgever",
      titel: "De eerste echte opdrachtgever met een klus",
      uitleg: "Eén branche, één stad, persoonlijk verkocht. De werkers zijn er al; er is een bedrijf nodig dat een echte klus plaatst.",
      wie: "jij",
      klaar: s.echteKlussen > 0,
      href: "/admin/sales",
      knop: "Naar de pijplijn",
    },
    {
      id: "uren",
      titel: "De eerste gewerkte en goedgekeurde uren",
      uitleg: "Een werker werkt de klus, het bedrijf keurt de uren goed. Dan maakt ZekerFlex vanzelf de factuur voor de platformkosten.",
      wie: "ZekerFlex",
      klaar: s.urenstaten > 0 && s.echteKlussen > 0,
      href: "/admin/facturen",
      knop: "Naar facturen",
    },
    {
      id: "betaald",
      titel: "De eerste betaalde factuur",
      uitleg: "Pas als er geld is binnengekomen, is er omzet. Tot dan staat hier nul.",
      wie: "jij",
      klaar: s.omzetOoitCents > 0,
      href: "/admin/financien",
      knop: "Naar Financiën",
    },
    {
      id: "kosten",
      titel: "De vaste kosten gedekt",
      uitleg: "De omzet van een maand is minstens zo hoog als de vaste kosten van die maand. Vanaf daar is elke euro winst.",
      wie: "jij",
      klaar: s.kostenMaandCents !== null && s.kostenMaandCents > 0 && s.omzet30Cents >= s.kostenMaandCents,
      href: "/admin/kosten",
      knop: "Naar Kosten",
    },
  ];
}

/** De stap van nu: de eerste die niet klaar is; null als alles klaar is. */
export function stapVanNu(stappen: readonly WinstStap[]): WinstStap | null {
  return stappen.find((x) => !x.klaar) ?? null;
}

export interface Gebied {
  /** de eerste twee cijfers van de postcode, bijvoorbeeld "10" */
  gebied: string;
  aantal: number;
}

/**
 * Waar de werkers wonen, per postcodegebied (eerste twee cijfers). Alleen gebieden met drie of meer werkers staan apart:
 * kleinere groepen tellen samen als "verspreid", zodat niemand te herleiden is.
 */
export function gebiedenVan(postcodes: readonly (string | null | undefined)[]): { gebieden: Gebied[]; verspreid: number; zonder: number } {
  const telling = new Map<string, number>();
  let zonder = 0;
  for (const p of postcodes) {
    const m = typeof p === "string" ? /^\s*([1-9]\d)\d{2}/.exec(p) : null;
    if (!m?.[1]) {
      zonder++;
      continue;
    }
    telling.set(m[1], (telling.get(m[1]) ?? 0) + 1);
  }
  const gebieden: Gebied[] = [];
  let verspreid = 0;
  for (const [gebied, aantal] of telling) {
    if (aantal >= 3) gebieden.push({ gebied, aantal });
    else verspreid += aantal;
  }
  gebieden.sort((a, b) => b.aantal - a.aantal || a.gebied.localeCompare(b.gebied));
  return { gebieden, verspreid, zonder };
}

/** Een bedrijf dat ZekerFlex zelf gebruikt om te testen (zelfde regel als lib/shifts/testklus.ts: de naam begint met "Test"). */
export const isTestbedrijf = (naam: string): boolean => /^\s*test(\s|$)/i.test(naam);
