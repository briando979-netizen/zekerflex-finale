// De bedragen in de kostenregel van een klus (loon + platformkosten = totaal excl. btw): op /klus-plaatsen, in de klus-wizard en bij
// "Snel een klus plaatsen". Puur bestand, zodat de test het zonder browser nalopen kan (tests/kosten-bedragen.test.ts).
//
// 23 nov 2026 (schermcontrole van de live site): bij loon € 146,25 en platformkosten € 26,25 stond als totaal "€ 173" (gewone
// optelling: € 172,50), en bij € 121,50 + € 26,25 stond er "€ 148" in plaats van € 147,75. Het totaal werd op hele euro's afgerond
// terwijl de regels erboven op de cent staan. Nu staan alle drie op twee decimalen en is het totaal altijd de som van de twee
// bedragen erboven: we rekenen in hele centen (nooit eerst afronden en dan optellen) en maken er pas daarna tekst van.

export type KostenTaal = "nl" | "en";

const FORMAAT: Record<KostenTaal, Intl.NumberFormat> = {
  nl: new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  en: new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

/** Hele centen als euro's met altijd twee decimalen: "€ 172,50" (Nederlands) of "€172.50" (Engels). */
export function euroTweeDecimalen(cents: number, taal: KostenTaal = "nl"): string {
  return FORMAAT[taal].format(Math.round(cents) / 100);
}

export interface KostenBedragen {
  loon: string;
  platform: string;
  totaal: string;
  /** het totaal in hele centen: precies loon + platformkosten */
  totaalCents: number;
}

/**
 * De drie bedragen naast elkaar. Het totaal is hier de som van loon en platformkosten (niet een apart afgerond getal), dus wat er
 * staat klopt altijd op de cent met wat erboven staat.
 */
export function kostenBedragen(k: { grossTotalCents: number; feeTotalCents: number }, taal: KostenTaal = "nl"): KostenBedragen {
  const loon = Math.round(k.grossTotalCents);
  const platform = Math.round(k.feeTotalCents);
  const totaalCents = loon + platform;
  return { loon: euroTweeDecimalen(loon, taal), platform: euroTweeDecimalen(platform, taal), totaal: euroTweeDecimalen(totaalCents, taal), totaalCents };
}
