// ---------------------------------------------------------------------------
// Jaarafsluiting als CONCEPT: balans, winst-en-verliesrekening en de cijfers die een US tax preparer
// voor Form 1120 (met 5472) nodig heeft. Puur rekenwerk op de proefbalans uit lib/boekhouding/lezen.ts.
// Niets hiervan is een jaarrekening of aangifte: de indeling bevestigt een accountant, indienen doet
// een mens. Bedragen in centen in de valuta van de administratie (omrekenen naar dollars beslist de
// preparer, met een koers die hij kiest).
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import type { ProefbalansRij } from "@/lib/boekhouding/lezen-kern";

export interface Post {
  rekeningNummer: string;
  naam: string;
  cents: number;
}

export interface Jaarconcept {
  jaar: number;
  van: string;
  tot: string;
  valuta: string;
  balans: {
    /** rekeningen met een debetsaldo op de laatste dag (bezittingen) */
    debet: Post[];
    /** rekeningen met een creditsaldo (schulden en eigen vermogen), als positief bedrag */
    credit: Post[];
    totaalDebet: number;
    totaalCredit: number;
    /** winst (+) of verlies (-) van dit boekjaar */
    resultaatJaar: number;
    /** resultaat van eerdere jaren dat nog niet in het eigen vermogen is geboekt */
    resultaatEerder: number;
    /** debet = credit + resultaten: de boeken sluiten */
    sluit: boolean;
    verschilCents: number;
  };
  wv: {
    opbrengsten: Post[];
    kosten: Post[];
    totaalOpbrengsten: number;
    totaalKosten: number;
    resultaat: number;
  };
  us: {
    /** Form 1120, regel 1a "gross receipts": de opbrengsten (concept) */
    grossReceiptsCents: number;
    /** de kosten (concept; welke aftrekbaar zijn, beslist de preparer) */
    deductionsCents: number;
    /** resultaat vóór fiscale correcties */
    resultaatCents: number;
    /** Schedule L "total assets" op de laatste dag; ook de gross assets voor de Delaware-rekenhulp */
    totalAssetsCents: number;
    /** true als de administratie niet in dollars is: de preparer rekent om */
    omrekenenNodig: boolean;
  };
}

const saldo = (r: ProefbalansRij) => r.debetCents - r.creditCents;
const som = (posten: readonly Post[]) => posten.reduce((s, p) => s + p.cents, 0);
const opNummer = (a: Post, b: Post) => a.rekeningNummer.localeCompare(b.rekeningNummer, "nl", { numeric: true });

/** Winst (+) of verlies (-) uit winst-en-verliesrijen: opbrengsten (credit) min kosten (debet). */
export function resultaatUit(rijen: readonly ProefbalansRij[]): number {
  return rijen.filter((r) => r.kant === "WV").reduce((s, r) => s - saldo(r), 0);
}

export interface JaarInvoer {
  jaar: number;
  van: string;
  tot: string;
  valuta: string;
  /** proefbalans vanaf het begin van de administratie t/m de laatste dag (cumulatief) */
  totEind: readonly ProefbalansRij[];
  /** proefbalans van alleen dit boekjaar */
  ditJaar: readonly ProefbalansRij[];
}

export function jaarconcept(i: JaarInvoer): Jaarconcept {
  const balansRijen = i.totEind.filter((r) => r.kant === "BALANS");
  const debet = balansRijen.filter((r) => saldo(r) > 0).map((r) => ({ rekeningNummer: r.rekeningNummer, naam: r.naam, cents: saldo(r) })).sort(opNummer);
  const credit = balansRijen.filter((r) => saldo(r) < 0).map((r) => ({ rekeningNummer: r.rekeningNummer, naam: r.naam, cents: -saldo(r) })).sort(opNummer);
  const wvJaar = i.ditJaar.filter((r) => r.kant === "WV");
  const opbrengsten = wvJaar.filter((r) => saldo(r) < 0).map((r) => ({ rekeningNummer: r.rekeningNummer, naam: r.naam, cents: -saldo(r) })).sort(opNummer);
  const kosten = wvJaar.filter((r) => saldo(r) > 0).map((r) => ({ rekeningNummer: r.rekeningNummer, naam: r.naam, cents: saldo(r) })).sort(opNummer);
  const resultaatJaar = resultaatUit(i.ditJaar);
  const resultaatEerder = resultaatUit(i.totEind) - resultaatJaar;
  const totaalDebet = som(debet);
  const totaalCredit = som(credit);
  // Elke boeking sluit, dus over alle rekeningen samen is debet gelijk aan credit:
  // bezittingen = schulden en eigen vermogen + het (nog niet verdeelde) resultaat.
  const verschil = totaalDebet - (totaalCredit + resultaatJaar + resultaatEerder);
  return {
    jaar: i.jaar,
    van: i.van,
    tot: i.tot,
    valuta: i.valuta,
    balans: { debet, credit, totaalDebet, totaalCredit, resultaatJaar, resultaatEerder, sluit: verschil === 0, verschilCents: verschil },
    wv: { opbrengsten, kosten, totaalOpbrengsten: som(opbrengsten), totaalKosten: som(kosten), resultaat: resultaatJaar },
    us: {
      grossReceiptsCents: som(opbrengsten),
      deductionsCents: som(kosten),
      resultaatCents: resultaatJaar,
      totalAssetsCents: totaalDebet,
      omrekenenNodig: i.valuta.toUpperCase() !== "USD",
    },
  };
}

/** Het boekjaar dat in `jaar` begint, met de beginmaand van de administratie (1 = kalenderjaar). */
export function boekjaarGrenzen(jaar: number, startMaand: number): { van: string; tot: string } {
  const m = Math.min(12, Math.max(1, Math.trunc(startMaand) || 1));
  const van = `${jaar}-${String(m).padStart(2, "0")}-01`;
  const eind = new Date(Date.UTC(jaar + 1, m - 1, 0)); // de dag vóór het begin van het volgende boekjaar
  return { van, tot: eind.toISOString().slice(0, 10) };
}

/** Begin van "alles tot nu": vroeger dan elke boeking. */
export const VROEGSTE_DAG = "2000-01-01";

/**
 * Vragen voor de mens die de aangifte doet. Geen regels, alleen wat de boeken niet kunnen weten:
 * die vragen horen in het dossier, zodat niets stil wordt aangenomen.
 */
export function openVragen(c: Jaarconcept): string[] {
  const vragen = [
    "Form 5472: welke transacties waren er met de buitenlandse aandeelhouder (kapitaalstorting bij de oprichting, leningen, betalingen, kosten die hij voorschoot)? De boekhouding bevat bewust geen namen; de bestuurder vult dit aan.",
    "Welke kosten zijn voor de VS aftrekbaar, en zijn er fiscale correcties op het resultaat?",
    "Wordt de vennootschap ook in Nederland belast (werkelijke leiding in Nederland), en hoe regelt het belastingverdrag dubbele heffing?",
    "Hoe worden de ontvangsten via het Stripe-account van de stichting in de boeken van de Inc. verwerkt?",
  ];
  if (c.us.omrekenenNodig) vragen.unshift(`De administratie is in ${c.valuta}. Met welke koers worden de bedragen naar dollars omgerekend voor Form 1120 en Schedule L?`);
  if (!c.balans.sluit) vragen.unshift(`De conceptbalans sluit niet (verschil ${c.balans.verschilCents} cent). Eerst uitzoeken voordat iets wordt ingediend.`);
  if (c.balans.resultaatEerder !== 0) vragen.push("Er staat resultaat van eerdere jaren open dat nog niet in het eigen vermogen is geboekt: hoe wordt het verdeeld?");
  return vragen;
}

/** Een boekjaar uit de query (?jaar=2026), tussen 2020 en volgend jaar; zonder query het huidige jaar. */
export function jaarUit(url: string, nuJaar: number): number {
  const ruw = new URL(url).searchParams.get("jaar");
  const jaar = ruw === null ? nuJaar : Number(ruw);
  if (!Number.isInteger(jaar) || jaar < 2020 || jaar > nuJaar + 1) throw AppError.validation("Kies een geldig boekjaar.");
  return jaar;
}
