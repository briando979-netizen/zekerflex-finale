// Eén hulpje voor de weergave van geld, uren en het tariefveld in de klus-wizard van de werkgever en het voorbeeld ernaast, per taal:
// Nederlands met een komma, Engels met een punt, en geld op twee decimalen waar er cent in zit. Puur bestand: de test loopt het zonder
// browser na (tests/klus-weergave.test.ts). Het geld in de kostenregel komt uit lib/klusconcept/kosten-tekst.ts (dezelfde opmaak).
//
// 23 nov 2026 (schermcontrole van de live wizard): "Bruto per plek € 146" had geen decimalen terwijl de kostenregel "€ 146,25" toonde,
// "Duur 7.5 u" en het uurtariefveld "19.50" gebruikten een punt terwijl de rest een komma gebruikt.

import { euroTweeDecimalen, type KostenTaal } from "@/lib/klusconcept/kosten-tekst";

export type WeergaveTaal = KostenTaal;

const LOCALE: Record<WeergaveTaal, string> = { nl: "nl-NL", en: "en-GB" };

const UREN: Record<WeergaveTaal, Intl.NumberFormat> = {
  nl: new Intl.NumberFormat(LOCALE.nl, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
  en: new Intl.NumberFormat(LOCALE.en, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
};

const BEDRAG: Record<WeergaveTaal, Intl.NumberFormat> = {
  nl: new Intl.NumberFormat(LOCALE.nl, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  en: new Intl.NumberFormat(LOCALE.en, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

/** Hele centen als geld met euroteken en twee decimalen: "€ 146,25" (Nederlands) of "€146.25" (Engels). */
export function geldTekst(cents: number, taal: WeergaveTaal = "nl"): string {
  return euroTweeDecimalen(cents, taal);
}

/** Hele centen als bedrag zonder euroteken, voor een tekst met het teken erin ("€ {bedrag}/u"): "19,50" of "19.50". */
export function bedragTekst(cents: number, taal: WeergaveTaal = "nl"): string {
  return BEDRAG[taal].format(Math.round(cents) / 100);
}

/** Gewerkte uren: "7,5" (Nederlands) of "7.5" (Engels); hele uren zonder decimalen, nooit meer dan twee. */
export function urenTekst(uren: number, taal: WeergaveTaal = "nl"): string {
  return UREN[taal].format(Number.isFinite(uren) ? uren : 0);
}

/**
 * Het tariefveld bewaart zijn waarde altijd met een punt ("19.5", "19."), zodat het rekenen overal hetzelfde blijft; dit is wat de
 * bezoeker ziet: een komma in het Nederlands, een punt in het Engels.
 */
export function tariefWeergave(canoniek: string, taal: WeergaveTaal = "nl"): string {
  return taal === "nl" ? canoniek.replace(".", ",") : canoniek;
}

/**
 * Wat de bezoeker typt in het tariefveld ("19,5", "19.50", "€ 19") als bewaarde waarde met een punt: alleen cijfers en één
 * decimaalteken (komma of punt), hooguit twee decimalen. "19," wordt "19." zodat typen vloeiend blijft.
 */
export function tariefInvoer(ruw: string): string {
  const schoon = ruw.replace(/[^\d.,]/g, "");
  const i = schoon.search(/[.,]/);
  if (i === -1) return schoon;
  const hele = schoon.slice(0, i);
  const decimalen = schoon.slice(i + 1).replace(/[.,]/g, "").slice(0, 2);
  return `${hele}.${decimalen}`;
}

/** Het bewaarde tarief ("19.5") in hele centen; leeg of onleesbaar is 0 (nooit NaN: een lege waarde mag het formulier niet openzetten). */
export function centsUitTarief(canoniek: string): number {
  const n = parseFloat(canoniek);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
