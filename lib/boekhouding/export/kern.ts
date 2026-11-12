// ---------------------------------------------------------------------------
// Export voor de accountant: de rekenkern (puur, zonder prisma). Kolommenbalans (proefbalans met openingssaldo,
// mutaties en eindsaldo), winst-en-verliesrekening, boekjaar- en periodegrenzen en de CSV-uitvoer. Alles in gehele
// centen; er wordt nooit met kommagetallen gerekend. Eén administratie heeft één valuta: de uitkomst draagt die valuta
// mee en bedragen in verschillende valuta's worden nergens bij elkaar opgeteld.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { isGeheleCenten } from "../bedrag";
import { isGeldigeBoekdag } from "../sluiting";

export type ExportSoort = "ACTIVA" | "PASSIVA" | "OMZET" | "KOSTEN";

export interface ExportRekening {
  nummer: string;
  naam: string;
  soort: ExportSoort;
}

/** Debet en credit per rekeningnummer (gesommeerd over een stuk tijd). */
export interface ExportSom {
  rekeningNummer: string;
  debetCents: number;
  creditCents: number;
}

/** Rekeningnummer van de samengestelde rij "Resultaat voorgaande boekjaren" (staat nooit in het rekeningschema). */
export const RESULTAAT_VORIG_NUMMER = "RESVORIG";
export const RESULTAAT_VORIG_NAAM = "Resultaat voorgaande boekjaren";

export const isBalansSoort = (s: ExportSoort): boolean => s === "ACTIVA" || s === "PASSIVA";

const pad = (n: number): string => String(n).padStart(2, "0");

// ---------------------------------------------------------------------------
// Boekjaar en periode
// ---------------------------------------------------------------------------

/**
 * Het boekjaar dat in kalenderjaar `jaar` begint, als eerste en laatste dag. Met startmaand 1 is dat het kalenderjaar;
 * met startmaand 7 loopt "2026" van 2026-07-01 t/m 2027-06-30.
 */
export function boekjaarGrenzen(jaar: number, startMaand: number): { van: string; tot: string } {
  if (!Number.isInteger(jaar) || jaar < 2000 || jaar > 2100) throw AppError.validation("Het jaar is geen geldig jaar.");
  if (!Number.isInteger(startMaand) || startMaand < 1 || startMaand > 12) throw AppError.validation("De startmaand van het boekjaar is 1 t/m 12.");
  const eindMaand = startMaand === 1 ? 12 : startMaand - 1;
  const eindJaar = startMaand === 1 ? jaar : jaar + 1;
  const laatsteDag = new Date(Date.UTC(eindJaar, eindMaand, 0)).getUTCDate();
  return { van: `${jaar}-${pad(startMaand)}-01`, tot: `${eindJaar}-${pad(eindMaand)}-${pad(laatsteDag)}` };
}

/** Het jaar (zoals boekjaarGrenzen het telt) van het boekjaar waarin een dag valt. */
export function boekjaarVan(dag: string, startMaand: number): number {
  const jaar = Number(dag.slice(0, 4));
  const maand = Number(dag.slice(5, 7));
  return maand >= startMaand ? jaar : jaar - 1;
}

export interface ExportPeriode {
  /** het boekjaar waarin de periode begint */
  jaar: number;
  van: string;
  tot: string;
  /** eerste dag van dat boekjaar: vanaf hier tellen winst-en-verliesrekeningen mee in het openingssaldo */
  boekjaarStart: string;
  boekjaarEinde: string;
  /** de hele periode is precies één boekjaar */
  heelBoekjaar: boolean;
}

export interface PeriodeInvoer {
  jaar?: number | undefined;
  van?: string | undefined;
  tot?: string | undefined;
}

/**
 * Bepaalt de periode uit een boekjaar of uit twee dagen. Een eigen periode mag niet over twee boekjaren lopen: het
 * openingssaldo van de winst-en-verliesrekeningen begint steeds bij een nieuw boekjaar.
 */
export function bepaalPeriode(invoer: PeriodeInvoer, startMaand: number): ExportPeriode {
  if (invoer.jaar !== undefined && (invoer.van !== undefined || invoer.tot !== undefined)) {
    throw AppError.validation("Kies óf een boekjaar, óf een begin- en einddatum, niet allebei.");
  }
  if (invoer.jaar !== undefined) {
    const g = boekjaarGrenzen(invoer.jaar, startMaand);
    return { jaar: invoer.jaar, van: g.van, tot: g.tot, boekjaarStart: g.van, boekjaarEinde: g.tot, heelBoekjaar: true };
  }
  if (!invoer.van || !invoer.tot) throw AppError.validation("Kies een boekjaar, of vul een begin- en einddatum in.");
  if (!isGeldigeBoekdag(invoer.van)) throw AppError.validation("De begindatum is geen geldige dag (verwacht: JJJJ-MM-DD).");
  if (!isGeldigeBoekdag(invoer.tot)) throw AppError.validation("De einddatum is geen geldige dag (verwacht: JJJJ-MM-DD).");
  if (invoer.van > invoer.tot) throw AppError.validation("De begindatum ligt na de einddatum.");
  const jaar = boekjaarVan(invoer.van, startMaand);
  const g = boekjaarGrenzen(jaar, startMaand);
  if (invoer.tot > g.tot) throw AppError.validation(`Een periode mag niet over twee boekjaren lopen. Dit boekjaar eindigt op ${g.tot}.`);
  return { jaar, van: invoer.van, tot: invoer.tot, boekjaarStart: g.van, boekjaarEinde: g.tot, heelBoekjaar: invoer.van === g.van && invoer.tot === g.tot };
}

/** De kalendermaanden die een periode raakt, van vroeg naar laat. */
export function maandenIn(van: string, tot: string): { jaar: number; maand: number }[] {
  const uit: { jaar: number; maand: number }[] = [];
  let jaar = Number(van.slice(0, 4));
  let maand = Number(van.slice(5, 7));
  const eindJaar = Number(tot.slice(0, 4));
  const eindMaand = Number(tot.slice(5, 7));
  while (jaar < eindJaar || (jaar === eindJaar && maand <= eindMaand)) {
    uit.push({ jaar, maand });
    maand++;
    if (maand > 12) {
      maand = 1;
      jaar++;
    }
  }
  return uit;
}

/** De kalenderkwartalen die een periode raakt. */
export function kwartalenIn(van: string, tot: string): { jaar: number; kwartaal: number }[] {
  const gezien = new Set<string>();
  const uit: { jaar: number; kwartaal: number }[] = [];
  for (const m of maandenIn(van, tot)) {
    const kwartaal = Math.floor((m.maand - 1) / 3) + 1;
    const sleutel = `${m.jaar}-${kwartaal}`;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push({ jaar: m.jaar, kwartaal });
  }
  return uit;
}

// ---------------------------------------------------------------------------
// Kolommenbalans
// ---------------------------------------------------------------------------

export interface KolommenRij {
  rekeningNummer: string;
  naam: string;
  soort: ExportSoort;
  kant: "BALANS" | "WV";
  openingDebetCents: number;
  openingCreditCents: number;
  mutatieDebetCents: number;
  mutatieCreditCents: number;
  eindDebetCents: number;
  eindCreditCents: number;
}

export interface KolommenTotalen {
  openingDebetCents: number;
  openingCreditCents: number;
  mutatieDebetCents: number;
  mutatieCreditCents: number;
  eindDebetCents: number;
  eindCreditCents: number;
}

export interface Kolommenbalans {
  valuta: string;
  van: string;
  tot: string;
  rijen: KolommenRij[];
  totalen: KolommenTotalen;
  /** debet is gelijk aan credit in alle drie de paren van kolommen */
  inBalans: boolean;
}

export interface KolommenInvoer {
  valuta: string;
  van: string;
  tot: string;
  rekeningen: readonly ExportRekening[];
  /** alles vóór `van`: balansrekeningen sinds het begin, winst-en-verliesrekeningen sinds het begin van het boekjaar */
  openingSommen: readonly ExportSom[];
  /** de beweging in de periode zelf */
  mutatieSommen: readonly ExportSom[];
  /**
   * Winst (positief) of verlies (negatief) van alle boekjaren vóór dit boekjaar, in centen: dat is al afgesloten en
   * staat in het openingssaldo van de balans als "Resultaat voorgaande boekjaren" (anders zou de balans niet sluiten).
   */
  resultaatVorigeJarenCents?: number | undefined;
}

function controleerSom(s: ExportSom): void {
  if (!isGeheleCenten(s.debetCents) || !isGeheleCenten(s.creditCents)) throw AppError.validation("Een bedrag in de boekhouding is een geheel aantal centen.");
  if (s.debetCents < 0 || s.creditCents < 0) throw AppError.validation("Een som van debet of credit kan niet negatief zijn.");
}

/** Zet een nettosaldo (debet min credit) in één van de twee kolommen. */
export function naarKolommen(nettoDebetCents: number): { debetCents: number; creditCents: number } {
  return nettoDebetCents >= 0 ? { debetCents: nettoDebetCents, creditCents: 0 } : { debetCents: 0, creditCents: -nettoDebetCents };
}

export function kolommenbalans(invoer: KolommenInvoer): Kolommenbalans {
  const perNummer = new Map<string, ExportRekening>();
  for (const r of invoer.rekeningen) perNummer.set(r.nummer, r);
  const opening = new Map<string, number>(); // netto debet min credit
  const mutatie = new Map<string, { d: number; c: number }>();

  for (const s of invoer.openingSommen) {
    controleerSom(s);
    if (!perNummer.has(s.rekeningNummer)) throw AppError.validation(`Er staan boekregels op rekening ${s.rekeningNummer}, maar die staat niet in het rekeningschema.`);
    opening.set(s.rekeningNummer, (opening.get(s.rekeningNummer) ?? 0) + s.debetCents - s.creditCents);
  }
  for (const s of invoer.mutatieSommen) {
    controleerSom(s);
    if (!perNummer.has(s.rekeningNummer)) throw AppError.validation(`Er staan boekregels op rekening ${s.rekeningNummer}, maar die staat niet in het rekeningschema.`);
    const m = mutatie.get(s.rekeningNummer) ?? { d: 0, c: 0 };
    m.d += s.debetCents;
    m.c += s.creditCents;
    mutatie.set(s.rekeningNummer, m);
  }

  const rijen: KolommenRij[] = [];
  const bouw = (rekening: ExportRekening, openingNetto: number, m: { d: number; c: number }): void => {
    if (openingNetto === 0 && m.d === 0 && m.c === 0) return;
    const o = naarKolommen(openingNetto);
    const e = naarKolommen(openingNetto + m.d - m.c);
    rijen.push({
      rekeningNummer: rekening.nummer,
      naam: rekening.naam,
      soort: rekening.soort,
      kant: isBalansSoort(rekening.soort) ? "BALANS" : "WV",
      openingDebetCents: o.debetCents,
      openingCreditCents: o.creditCents,
      mutatieDebetCents: m.d,
      mutatieCreditCents: m.c,
      eindDebetCents: e.debetCents,
      eindCreditCents: e.creditCents,
    });
  };
  for (const rekening of perNummer.values()) bouw(rekening, opening.get(rekening.nummer) ?? 0, mutatie.get(rekening.nummer) ?? { d: 0, c: 0 });

  const vorig = invoer.resultaatVorigeJarenCents ?? 0;
  if (!isGeheleCenten(vorig)) throw AppError.validation("Het resultaat van voorgaande jaren is een geheel aantal centen.");
  // winst = credit-saldo, dus netto debet is het omgekeerde
  bouw({ nummer: RESULTAAT_VORIG_NUMMER, naam: RESULTAAT_VORIG_NAAM, soort: "PASSIVA" }, -vorig, { d: 0, c: 0 });

  rijen.sort((a, b) => a.rekeningNummer.localeCompare(b.rekeningNummer, "nl", { numeric: true }));

  const totalen: KolommenTotalen = { openingDebetCents: 0, openingCreditCents: 0, mutatieDebetCents: 0, mutatieCreditCents: 0, eindDebetCents: 0, eindCreditCents: 0 };
  for (const r of rijen) {
    totalen.openingDebetCents += r.openingDebetCents;
    totalen.openingCreditCents += r.openingCreditCents;
    totalen.mutatieDebetCents += r.mutatieDebetCents;
    totalen.mutatieCreditCents += r.mutatieCreditCents;
    totalen.eindDebetCents += r.eindDebetCents;
    totalen.eindCreditCents += r.eindCreditCents;
  }
  return {
    valuta: invoer.valuta,
    van: invoer.van,
    tot: invoer.tot,
    rijen,
    totalen,
    inBalans:
      totalen.openingDebetCents === totalen.openingCreditCents &&
      totalen.mutatieDebetCents === totalen.mutatieCreditCents &&
      totalen.eindDebetCents === totalen.eindCreditCents,
  };
}

// ---------------------------------------------------------------------------
// Winst- en verliesrekening
// ---------------------------------------------------------------------------

export interface WvRij {
  rekeningNummer: string;
  naam: string;
  /** opbrengsten: credit min debet; kosten: debet min credit (dus een teruggeboekte kost is negatief) */
  bedragCents: number;
}

export interface WinstVerlies {
  valuta: string;
  van: string;
  tot: string;
  opbrengsten: WvRij[];
  kosten: WvRij[];
  totaalOpbrengstenCents: number;
  totaalKostenCents: number;
  /** opbrengsten min kosten: winst is positief, verlies negatief */
  resultaatCents: number;
}

export interface WvInvoer {
  valuta: string;
  van: string;
  tot: string;
  rekeningen: readonly ExportRekening[];
  mutatieSommen: readonly ExportSom[];
}

export function winstVerlies(invoer: WvInvoer): WinstVerlies {
  const perNummer = new Map<string, ExportRekening>();
  for (const r of invoer.rekeningen) perNummer.set(r.nummer, r);
  const netto = new Map<string, number>(); // debet min credit
  for (const s of invoer.mutatieSommen) {
    controleerSom(s);
    if (!perNummer.has(s.rekeningNummer)) throw AppError.validation(`Er staan boekregels op rekening ${s.rekeningNummer}, maar die staat niet in het rekeningschema.`);
    netto.set(s.rekeningNummer, (netto.get(s.rekeningNummer) ?? 0) + s.debetCents - s.creditCents);
  }
  const opbrengsten: WvRij[] = [];
  const kosten: WvRij[] = [];
  for (const [nummer, debetMinCredit] of netto) {
    const rekening = perNummer.get(nummer);
    if (!rekening || debetMinCredit === 0) continue;
    if (rekening.soort === "OMZET") opbrengsten.push({ rekeningNummer: nummer, naam: rekening.naam, bedragCents: -debetMinCredit });
    else if (rekening.soort === "KOSTEN") kosten.push({ rekeningNummer: nummer, naam: rekening.naam, bedragCents: debetMinCredit });
  }
  const op = (a: WvRij, b: WvRij) => a.rekeningNummer.localeCompare(b.rekeningNummer, "nl", { numeric: true });
  opbrengsten.sort(op);
  kosten.sort(op);
  const totaalOpbrengstenCents = opbrengsten.reduce((s, r) => s + r.bedragCents, 0);
  const totaalKostenCents = kosten.reduce((s, r) => s + r.bedragCents, 0);
  return {
    valuta: invoer.valuta,
    van: invoer.van,
    tot: invoer.tot,
    opbrengsten,
    kosten,
    totaalOpbrengstenCents,
    totaalKostenCents,
    resultaatCents: totaalOpbrengstenCents - totaalKostenCents,
  };
}

// ---------------------------------------------------------------------------
// Bedragen en CSV
// ---------------------------------------------------------------------------

/** Gehele centen als "1234,56" (Nederlandse komma, geen duizendtallen: Excel leest het zo als getal). */
export function centenKomma(cents: number): string {
  if (!isGeheleCenten(cents)) throw new RangeError("Een bedrag is een geheel aantal centen.");
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** Een tekstveld voor CSV: aanhalingstekens waar nodig, en een apostrof vóór tekens waarmee Excel een formule start. */
export function csvTekst(tekst: string): string {
  const veilig = /^[=+@\t\r]/.test(tekst) ? `'${tekst}` : tekst;
  return /[";\r\n]/.test(veilig) ? `"${veilig.replace(/"/g, '""')}"` : veilig;
}

const BOM = "\uFEFF";
const SOORT_TEKST: Readonly<Record<ExportSoort, string>> = { ACTIVA: "Activa", PASSIVA: "Passiva", OMZET: "Opbrengsten", KOSTEN: "Kosten" };
export const soortTekst = (s: ExportSoort): string => SOORT_TEKST[s];

export function kolommenbalansCsv(k: Kolommenbalans): string {
  const v = k.valuta;
  const kop = [
    "Rekening",
    "Naam",
    "Soort",
    `Opening debet (${v})`,
    `Opening credit (${v})`,
    `Mutaties debet (${v})`,
    `Mutaties credit (${v})`,
    `Eindsaldo debet (${v})`,
    `Eindsaldo credit (${v})`,
  ].join(";");
  const regels = [kop];
  for (const r of k.rijen) {
    regels.push(
      [
        csvTekst(r.rekeningNummer),
        csvTekst(r.naam),
        soortTekst(r.soort),
        centenKomma(r.openingDebetCents),
        centenKomma(r.openingCreditCents),
        centenKomma(r.mutatieDebetCents),
        centenKomma(r.mutatieCreditCents),
        centenKomma(r.eindDebetCents),
        centenKomma(r.eindCreditCents),
      ].join(";"),
    );
  }
  const t = k.totalen;
  regels.push(
    ["", "Totaal", "", t.openingDebetCents, t.openingCreditCents, t.mutatieDebetCents, t.mutatieCreditCents, t.eindDebetCents, t.eindCreditCents]
      .map((x) => (typeof x === "number" ? centenKomma(x) : x))
      .join(";"),
    "",
    `Periode;${k.van} t/m ${k.tot}`,
    `Valuta;${v}`,
    `Debet en credit zijn ${k.inBalans ? "gelijk" : "NIET gelijk: laat dit nakijken voor je het doorgeeft"}`,
  );
  return `${BOM}${regels.join("\r\n")}\r\n`;
}

export function winstVerliesCsv(w: WinstVerlies): string {
  const v = w.valuta;
  const regels = [`Onderdeel;Rekening;Naam;Bedrag (${v})`];
  for (const r of w.opbrengsten) regels.push(["Opbrengsten", csvTekst(r.rekeningNummer), csvTekst(r.naam), centenKomma(r.bedragCents)].join(";"));
  regels.push(["Opbrengsten", "", "Totaal opbrengsten", centenKomma(w.totaalOpbrengstenCents)].join(";"));
  for (const r of w.kosten) regels.push(["Kosten", csvTekst(r.rekeningNummer), csvTekst(r.naam), centenKomma(r.bedragCents)].join(";"));
  regels.push(["Kosten", "", "Totaal kosten", centenKomma(w.totaalKostenCents)].join(";"));
  regels.push(["Resultaat", "", w.resultaatCents >= 0 ? "Winst" : "Verlies", centenKomma(w.resultaatCents)].join(";"));
  regels.push("", `Periode;${w.van} t/m ${w.tot}`, `Valuta;${v}`);
  return `${BOM}${regels.join("\r\n")}\r\n`;
}
