// ---------------------------------------------------------------------------
// Cijfervragen aan de AI-accountant ("wat is mijn omzet dit kwartaal", "hoeveel btw moet ik betalen",
// "welke facturen staan open", "wanneer is mijn volgende termijn"). Puur: herkennen van de vraag en
// de periode, en de tekst van het antwoord uit de cijfers die de server ophaalt (lib/accountant/cijfers.ts).
// Geen model: elk bedrag komt rechtstreeks uit de boeken, dus er kan niets verzonnen worden.
// Een vraag over een regel ("moet ik btw betalen over ...") is geen cijfervraag en gaat naar de kennisbank.
// ---------------------------------------------------------------------------

import type { OpenPost, ProefbalansRij } from "@/lib/boekhouding/lezen-kern";
import type { TermijnRij } from "@/lib/accountant/maandcontrole-kern";
import { bedrag } from "@/lib/accountant/dossier";

export type CijferWat = "termijn" | "openstaand" | "btw" | "resultaat" | "omzet" | "kosten";

export interface Periode {
  van: string;
  tot: string;
  /** "het 4e kwartaal van 2026 (1 oktober t/m 31 december)" */
  naam: string;
}

export interface Cijfervraag {
  wat: CijferWat;
  periode: Periode;
  /** bij een termijnvraag: een stukje van de sleutel om op te filteren ("83b", "btw", ...) */
  onderwerp: string | null;
}

const WAT: [CijferWat, RegExp][] = [
  ["termijn", /\b(deadlines?|termijn(en)?|uiterlijk|wanneer moet)\b/i],
  ["openstaand", /\b(openstaand\w*|onbetaald\w*|debiteuren|sta(at|an) (nog )?open|nog niet betaald)\b/i],
  ["btw", /\bbtw\b/i],
  ["resultaat", /\b(winst|verlies|resultaat)\b/i],
  ["omzet", /\b(omzet|opbrengst\w*|inkomsten|verdiend)\b/i],
  ["kosten", /\b(kosten|uitgaven|uitgegeven)\b/i],
];
/** Het gaat over de eigen cijfers (niet over een regel). */
const EIGEN = /\b(mijn|onze|ons|hoeveel|stand|tot nu toe|wat (is|was|zijn|waren) (de|mijn|onze))\b/i;
const PERIODE_WOORD = /\b(dit|deze|vorig|vorige) (kwartaal|maand|jaar)\b|\b(q|k)[1-4]\b|\bkwartaal\s*[1-4]\b|\b20\d\d\b/i;

const ONDERWERPEN: [RegExp, string][] = [
  [/\b83\s?\(?b\)?/i, "83b"],
  [/\bicp\b/i, "icp"],
  [/\bbtw\b/i, "btw"],
  [/\b(delaware|franchise)\b/i, "delaware"],
  [/\b(1120|5472)\b/, "1120"],
];

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const mm = (n: number) => String(n).padStart(2, "0");
const laatsteDag = (j: number, m: number) => new Date(Date.UTC(j, m, 0)).getUTCDate();
const dagNaam = (d: string) => `${Number(d.slice(8, 10))} ${MAANDEN[Number(d.slice(5, 7)) - 1] ?? ""}`;

function kwartaal(j: number, k: number): Periode {
  const m1 = (k - 1) * 3 + 1;
  const van = `${j}-${mm(m1)}-01`;
  const tot = `${j}-${mm(m1 + 2)}-${mm(laatsteDag(j, m1 + 2))}`;
  return { van, tot, naam: `het ${k}e kwartaal van ${j} (${dagNaam(van)} t/m ${dagNaam(tot)})` };
}
function maand(j: number, m: number): Periode {
  return { van: `${j}-${mm(m)}-01`, tot: `${j}-${mm(m)}-${mm(laatsteDag(j, m))}`, naam: `${MAANDEN[m - 1] ?? ""} ${j}` };
}
const heelJaar = (j: number): Periode => ({ van: `${j}-01-01`, tot: `${j}-12-31`, naam: `${j}` });

/** De periode uit de vraag; zonder periode het huidige kwartaal. */
export function periodeUit(vraag: string, vandaag: string): Periode {
  const j = Number(vandaag.slice(0, 4));
  const m = Number(vandaag.slice(5, 7));
  const k = Math.floor((m - 1) / 3) + 1;
  const jaarInVraag = /\b(20\d\d)\b/.exec(vraag);
  const jaar = jaarInVraag ? Number(jaarInVraag[1]) : j;
  const kw = /\b(?:q|k|kwartaal\s*)([1-4])\b/i.exec(vraag);
  if (kw) return kwartaal(jaar, Number(kw[1]));
  if (/\bvorige? kwartaal\b/i.test(vraag)) return k === 1 ? kwartaal(j - 1, 4) : kwartaal(j, k - 1);
  if (/\b(dit|deze) kwartaal\b/i.test(vraag)) return kwartaal(j, k);
  if (/\bvorige maand\b/i.test(vraag)) return m === 1 ? maand(j - 1, 12) : maand(j, m - 1);
  if (/\b(deze|dit) maand\b/i.test(vraag)) return maand(j, m);
  if (/\bvorig jaar\b/i.test(vraag)) return heelJaar(j - 1);
  if (/\bdit jaar\b/i.test(vraag) || jaarInVraag) return heelJaar(jaar);
  return kwartaal(j, k);
}

/** Is dit een vraag naar de eigen cijfers of termijnen? Zo niet: null (dan beslist de kennisbank). */
export function herkenCijfervraag(vraag: string, vandaag: string): Cijfervraag | null {
  const gevonden = WAT.find(([, re]) => re.test(vraag));
  if (!gevonden) return null;
  const wat = gevonden[0];
  if (wat !== "termijn" && !EIGEN.test(vraag) && !PERIODE_WOORD.test(vraag)) return null;
  const onderwerp = wat === "termijn" ? (ONDERWERPEN.find(([re]) => re.test(vraag))?.[1] ?? null) : null;
  return { wat, periode: periodeUit(vraag, vandaag), onderwerp };
}

const saldo = (r: ProefbalansRij) => r.debetCents - r.creditCents;

/** Omzet (opbrengsten), kosten en resultaat uit een proefbalans van de periode. */
export function wvCijfers(rijen: readonly ProefbalansRij[]): { omzet: number; kosten: number; resultaat: number } {
  const wv = rijen.filter((r) => r.kant === "WV");
  const omzet = wv.filter((r) => saldo(r) < 0).reduce((s, r) => s - saldo(r), 0);
  const kosten = wv.filter((r) => saldo(r) > 0).reduce((s, r) => s + saldo(r), 0);
  return { omzet, kosten, resultaat: omzet - kosten };
}

export const SLOT = "Dit is een concept uit je eigen boekhouding; een mens controleert het voordat je er iets mee doet.";

export function wvTekst(wat: "omzet" | "kosten" | "resultaat", p: Periode, admin: string, valuta: string, rijen: readonly ProefbalansRij[]): string {
  const c = wvCijfers(rijen);
  if (wat === "omzet") return `${admin}: de omzet over ${p.naam} is ${bedrag(c.omzet, valuta)}.`;
  if (wat === "kosten") return `${admin}: de kosten over ${p.naam} zijn ${bedrag(c.kosten, valuta)}.`;
  return `${admin}: over ${p.naam} is het resultaat ${bedrag(c.resultaat, valuta)} (${c.resultaat >= 0 ? "winst" : "verlies"}): ${bedrag(c.omzet, valuta)} omzet min ${bedrag(c.kosten, valuta)} kosten.`;
}

export function btwTekst(p: Periode, admin: string, valuta: string, geboektSaldoCents: number): string {
  const kern =
    geboektSaldoCents > 0
      ? `volgens de boeken ${bedrag(geboektSaldoCents, valuta)} btw te betalen`
      : geboektSaldoCents < 0
        ? `volgens de boeken ${bedrag(-geboektSaldoCents, valuta)} btw terug te vragen`
        : "volgens de boeken geen btw te betalen of terug te vragen";
  return `${admin}: over ${p.naam} is er ${kern}. Dat is een berekening uit de boekregels, geen aangifte; de indeling in rubrieken bevestigt een accountant.`;
}

export function openstaandTekst(admin: string, valuta: string, posten: readonly OpenPost[], vandaag: string): string {
  const deb = posten.filter((p) => p.soort === "DEBITEUR");
  if (deb.length === 0) return `${admin}: er staan geen facturen open.`;
  const som = deb.reduce((s, p) => s + p.saldoCents, 0);
  const oudste = deb.reduce((o, p) => (p.oudsteDatum < o ? p.oudsteDatum : o), deb[0]?.oudsteDatum ?? vandaag);
  return `${admin}: er ${deb.length === 1 ? "staat 1 factuur" : `staan ${deb.length} facturen`} open, samen ${bedrag(som, valuta)}. De oudste is van ${dagNaam(oudste)} ${oudste.slice(0, 4)}.`;
}

export function termijnTekst(termijnen: readonly TermijnRij[], onderwerp: string | null): string {
  const lijst = (onderwerp ? termijnen.filter((t) => t.sleutel.includes(onderwerp)) : termijnen).filter((t) => !t.klaar).slice(0, 3);
  if (lijst.length === 0) return onderwerp ? "Ik vind geen komende termijn voor dit onderwerp in de lijst." : "Er staan geen open termijnen in de komende maanden.";
  return lijst
    .map((t) => `${t.titel}: uiterlijk ${dagNaam(t.dag)} ${t.dag.slice(0, 4)} (nog ${t.dagenTot} ${t.dagenTot === 1 ? "dag" : "dagen"}). ${t.wat}`)
    .join("\n");
}
