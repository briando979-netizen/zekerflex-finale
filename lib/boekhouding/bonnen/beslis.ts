// ---------------------------------------------------------------------------
// Bonnen: de beslisregel (puur). Een bon wordt ALLEEN vanzelf geboekt als alles tegelijk klopt: de bedragen en datum
// (geen enkel probleem), de zekerheid is hoog, de valuta is die van de administratie, het is geen dubbele bon, en de
// herkomst is vertrouwd. Vertrouwd is:
//  - upload: een ingelogde beheerder (die telt zelf als vertrouwd);
//  - mail: de afzender staat op de lijst eigen afzenders EN SPF en DKIM zijn geslaagd.
// Al het andere is "even kijken": een mens beslist later met keurBonGoed of wijsBonAf. Twijfel is nooit een boeking.
// ---------------------------------------------------------------------------

import { ZEKERHEID_HOOG, type BonVelden } from "./velden";

export interface Herkomst {
  bron: "upload" | "mail";
  /** upload: een ingelogde beheerder deed dit */
  beheerder?: boolean | undefined;
  /** mail: staat de afzender op de lijst eigen afzenders? */
  afzenderOpLijst?: boolean | undefined;
  /** mail: SPF en DKIM geslaagd (en DKIM op het domein van de afzender) */
  spfDkimGeslaagd?: boolean | undefined;
}

export interface BeslisInvoer {
  /** null = de controle van de velden gaf een probleem */
  velden: BonVelden | null;
  problemen: readonly string[];
  zekerheidPromille: number;
  herkomst: Herkomst;
  /** de bon bestaat al (zelfde bestand, of zelfde leverancier + datum + bedrag) */
  dubbel: boolean;
  /** de functionele valuta van de administratie */
  administratieValuta: string;
}

export type Beslissing =
  | { actie: "boeken" }
  | { actie: "even-kijken"; redenen: string[] }
  | { actie: "dubbel" };

/** Is de herkomst vertrouwd genoeg voor automatisch boeken, en zo niet: waarom niet. */
export function herkomstRedenen(h: Herkomst): string[] {
  if (h.bron === "upload") {
    return h.beheerder === true ? [] : ["De bon is niet door een ingelogde beheerder aangeleverd."];
  }
  const redenen: string[] = [];
  if (h.afzenderOpLijst !== true) redenen.push("De afzender staat niet op de lijst met eigen afzenders.");
  if (h.spfDkimGeslaagd !== true) redenen.push("SPF en DKIM zijn niet allebei geslaagd (afzender niet te controleren).");
  return redenen;
}

export function beslisBon(i: BeslisInvoer): Beslissing {
  if (i.dubbel) return { actie: "dubbel" };
  const redenen: string[] = [...i.problemen];
  if (i.velden === null && redenen.length === 0) redenen.push("De bon kon niet worden uitgelezen.");
  if (i.velden !== null && i.velden.valuta !== i.administratieValuta) {
    redenen.push(`De bon is in ${i.velden.valuta}; deze administratie boekt in ${i.administratieValuta}. Een mens rekent om.`);
  }
  if (i.zekerheidPromille < ZEKERHEID_HOOG) {
    redenen.push(`De zekerheid van het uitlezen is te laag (${i.zekerheidPromille} van 1000, nodig ${ZEKERHEID_HOOG}).`);
  }
  redenen.push(...herkomstRedenen(i.herkomst));
  return redenen.length === 0 ? { actie: "boeken" } : { actie: "even-kijken", redenen };
}

// ---- dubbele bon -----------------------------------------------------------

export interface BonSleutel {
  id: string;
  sha256: string;
  leverancier: string | null;
  bonDatum: string | null;
  totaalCents: number | null;
}

/** Leverancier vergelijkbaar maken: kleine letters, zonder leestekens, spaties en bedrijfsvormen. */
export function normaliseerLeverancier(naam: string): string {
  return naam
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(b\.?v\.?|n\.?v\.?|inc\.?|ltd\.?|gmbh|llc|vof)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Is deze bon een dubbele van een bestaande? Dat is zo bij hetzelfde bestand (zelfde hash) of bij dezelfde leverancier,
 * dezelfde datum en hetzelfde totaal. Geeft de bestaande bon terug, of null.
 */
export function vindDubbel(nieuw: Omit<BonSleutel, "id">, bestaande: readonly BonSleutel[]): BonSleutel | null {
  for (const b of bestaande) {
    if (b.sha256 === nieuw.sha256) return b;
  }
  if (nieuw.leverancier === null || nieuw.bonDatum === null || nieuw.totaalCents === null) return null;
  const naam = normaliseerLeverancier(nieuw.leverancier);
  if (!naam) return null;
  for (const b of bestaande) {
    if (b.sha256 === nieuw.sha256) continue;
    if (
      b.leverancier !== null &&
      b.bonDatum === nieuw.bonDatum &&
      b.totaalCents === nieuw.totaalCents &&
      normaliseerLeverancier(b.leverancier) === naam
    ) {
      return b;
    }
  }
  return null;
}
