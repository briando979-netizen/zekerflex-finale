// ---------------------------------------------------------------------------
// XML Auditfile Financieel (XAF 3.2): de generator (puur, zonder prisma).
//
// LET OP: DIT BESTAND IS NIET GEVALIDEERD TEGEN HET OFFICIËLE XSD. De elementnamen, de volgorde en de toegestane
// waarden zijn geschreven uit het geheugen van wat een XAF 3.2 gangbaar bevat. Laat het resultaat controleren door een
// accountant of een XAF-validator (bijvoorbeeld die van de Belastingdienst of van de SRA) voor je het doorgeeft. Alle
// namen en vaste waarden staan op één plek, in XAF_CONFIG hieronder: klopt er iets niet, dan pas je het daar aan.
//
// Wat wel gecontroleerd wordt (los van het XSD): de XML is well-formed (alle tekst ontsnapt, ongeldige tekens eruit),
// elke boeking sluit, totalDebit is gelijk aan totalCredit, het regelaantal klopt, alle datums zijn jjjj-mm-dd, alle
// bedragen hebben een punt en twee decimalen (uit gehele centen, zonder floatafronding) en elke boekingsregel wijst naar
// een rekening uit het rekeningschema. Persoonsgegevens: de boekingen bevatten er geen; de bedrijfsnaam van de eigen
// administratie staat in company; tegenpartijen niet (customersSuppliers is leeg).
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { isGeheleCenten } from "../bedrag";
import { isGeldigeBoekdag } from "../sluiting";
import { isBalansSoort, RESULTAAT_VORIG_NAAM, RESULTAAT_VORIG_NUMMER, type ExportRekening, type ExportSoort } from "./kern";

/** Alle elementnamen en vaste waarden van de auditfile op één plek, om makkelijk te corrigeren. */
export const XAF_CONFIG = {
  versieTekst: "XAF 3.2 (niet gevalideerd tegen het XSD)",
  namespace: "http://www.auditfiles.nl/XAF/3.2",
  el: {
    root: "auditfile",
    header: "header",
    fiscalYear: "fiscalYear",
    startDate: "startDate",
    endDate: "endDate",
    curCode: "curCode",
    dateCreated: "dateCreated",
    softwareDesc: "softwareDesc",
    softwareVersion: "softwareVersion",
    company: "company",
    companyIdent: "companyIdent",
    companyName: "companyName",
    taxRegistrationCountry: "taxRegistrationCountry",
    taxRegIdent: "taxRegIdent",
    streetAddress: "streetAddress",
    customersSuppliers: "customersSuppliers",
    generalLedger: "generalLedger",
    ledgerAccount: "ledgerAccount",
    accID: "accID",
    accDesc: "accDesc",
    accTp: "accTp",
    glAccountType: "glAccountType",
    periods: "periods",
    period: "period",
    periodNumber: "periodNumber",
    periodDesc: "periodDesc",
    startDatePeriod: "startDatePeriod",
    endDatePeriod: "endDatePeriod",
    openingBalance: "openingBalance",
    opBalDate: "opBalDate",
    opBalDesc: "opBalDesc",
    linesCount: "linesCount",
    totalDebit: "totalDebit",
    totalCredit: "totalCredit",
    obLine: "obLine",
    transactions: "transactions",
    journal: "journal",
    jrnID: "jrnID",
    jrnDesc: "desc",
    jrnTp: "jrnTp",
    transaction: "transaction",
    trNr: "nr",
    trDesc: "desc",
    trPeriodNumber: "periodNumber",
    trDt: "trDt",
    trAmnt: "amnt",
    trAmntTp: "amntTp",
    trLine: "trLine",
    lineNr: "nr",
    lineAccID: "accID",
    lineDocRef: "docRef",
    lineEffDate: "effDate",
    lineDesc: "desc",
    lineAmnt: "amnt",
    lineAmntTp: "amntTp",
  },
  /** waarde van amntTp */
  debet: "D",
  credit: "C",
  /** waarde van accTp: B(alans) of P (winst en verlies) */
  accTpBalans: "B",
  accTpWinstVerlies: "P",
  /** glAccountType per soort rekening (de lijst toegestane waarden is NIET gecontroleerd) */
  glAccountType: { ACTIVA: "Asset", PASSIVA: "Liability", OMZET: "Income", KOSTEN: "Expense" } as Readonly<Record<ExportSoort, string>>,
  /** jrnTp per dagboek (de lijst toegestane waarden is NIET gecontroleerd): B bank, M memoriaal, P inkoop, S verkoop */
  journaalType: { VERKOOP: "S", INKOOP: "P", BANK: "B", MEMORIAAL: "M" } as Readonly<Record<string, string>>,
  /** omschrijvingen van de dagboeken in de auditfile */
  journaalOmschrijving: { VERKOOP: "Verkoopboek", INKOOP: "Inkoopboek", BANK: "Bankboek", MEMORIAAL: "Memoriaal" } as Readonly<Record<string, string>>,
  softwareDesc: "ZekerFlex",
  softwareVersion: "1",
  openingOmschrijving: "Openingsbalans",
} as const;

export interface XafRegel {
  rekeningNummer: string;
  debetCents: number;
  creditCents: number;
  omschrijving?: string | undefined;
}

export interface XafBoeking {
  boekstuk: string;
  dagboek: string;
  datum: string;
  omschrijving: string;
  /** de valuta van de regels; moet gelijk zijn aan die van de administratie */
  valuta: string;
  /** het nummer van de bon bij de boeking (BoekBon-id); anders het boekstuknummer */
  docRef: string;
  regels: XafRegel[];
}

/** Een openingssaldo van een balansrekening, aan één kant. */
export interface XafOpening {
  rekeningNummer: string;
  debetCents: number;
  creditCents: number;
}

export interface XafInvoer {
  bedrijf: {
    id: string;
    naam: string;
    /** ISO-landcode van de vestiging */
    land: string;
    btwNummer?: string | null | undefined;
    adres?: string | undefined;
  };
  valuta: string;
  /** het jaar waarin het boekjaar begint */
  jaar: number;
  /** eerste en laatste dag van het boekjaar */
  van: string;
  tot: string;
  /** maand waarin het boekjaar begint, 1-12 */
  startMaand: number;
  rekeningen: readonly ExportRekening[];
  /** alleen balansrekeningen; mag leeg zijn */
  opening: readonly XafOpening[];
  boekingen: readonly XafBoeking[];
  /** de dag waarop het bestand is gemaakt, "2026-11-12" */
  aangemaakt: string;
}

export interface XafUitvoer {
  xml: string;
  linesCount: number;
  transactieAantal: number;
  totalDebitCents: number;
  totalCreditCents: number;
}

// ---------------------------------------------------------------------------
// Hulpjes
// ---------------------------------------------------------------------------

/** Ongeldige XML 1.0-tekens eruit (besturingstekens, losse surrogaten, U+FFFE en U+FFFF). */
export function schoonXmlTekst(tekst: string): string {
  let uit = "";
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const volgende = tekst.charCodeAt(i + 1);
      if (volgende >= 0xdc00 && volgende <= 0xdfff) {
        uit += tekst[i]! + tekst[i + 1]!;
        i++;
      }
      continue; // een los surrogaat valt weg
    }
    if (c >= 0xdc00 && c <= 0xdfff) continue;
    if (c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd)) uit += tekst[i]!;
  }
  return uit;
}

/** Tekst voor tussen twee tags of in een attribuut: &, <, >, " en ' worden ontsnapt. */
export function xmlTekst(tekst: string): string {
  return schoonXmlTekst(tekst)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Gehele centen als "1234.56" (punt, twee decimalen, nooit negatief: de kant staat in amntTp). */
export function xafBedrag(cents: number): string {
  if (!isGeheleCenten(cents) || cents < 0) throw AppError.validation("Een bedrag in de auditfile is een positief geheel aantal centen.");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"] as const;

/** Het periodenummer van een dag binnen het boekjaar (1-12). */
export function periodeNummer(dag: string, startMaand: number): number {
  const maand = Number(dag.slice(5, 7));
  return ((maand - startMaand + 12) % 12) + 1;
}

const pad = (n: number): string => String(n).padStart(2, "0");

function periodenLijst(jaar: number, startMaand: number): { nr: number; omschrijving: string; van: string; tot: string }[] {
  const uit = [];
  for (let i = 0; i < 12; i++) {
    const m0 = startMaand - 1 + i;
    const j = jaar + Math.floor(m0 / 12);
    const m = (m0 % 12) + 1;
    const laatsteDag = new Date(Date.UTC(j, m, 0)).getUTCDate();
    uit.push({ nr: i + 1, omschrijving: `${MAANDEN[m - 1]!} ${j}`, van: `${j}-${pad(m)}-01`, tot: `${j}-${pad(m)}-${pad(laatsteDag)}` });
  }
  return uit;
}

class Schrijver {
  private readonly regels: string[] = [];
  private diepte = 0;
  open(naam: string, attributen = ""): void {
    this.regels.push(`${"  ".repeat(this.diepte)}<${naam}${attributen}>`);
    this.diepte++;
  }
  sluit(naam: string): void {
    this.diepte--;
    this.regels.push(`${"  ".repeat(this.diepte)}</${naam}>`);
  }
  leeg(naam: string): void {
    this.regels.push(`${"  ".repeat(this.diepte)}<${naam}/>`);
  }
  tekst(naam: string, waarde: string): void {
    this.regels.push(`${"  ".repeat(this.diepte)}<${naam}>${xmlTekst(waarde)}</${naam}>`);
  }
  tekstOfLeeg(naam: string, waarde: string): void {
    if (waarde === "") this.leeg(naam);
    else this.tekst(naam, waarde);
  }
  uit(): string {
    return this.regels.join("\n");
  }
}

function eis(waar: boolean, tekst: string): void {
  if (!waar) throw AppError.validation(tekst);
}

// ---------------------------------------------------------------------------
// De generator
// ---------------------------------------------------------------------------

export function maakXaf(invoer: XafInvoer): XafUitvoer {
  const E = XAF_CONFIG.el;
  eis(/^[A-Z]{3}$/.test(invoer.valuta), "De valuta is een code van drie hoofdletters, bijvoorbeeld EUR.");
  eis(isGeldigeBoekdag(invoer.van) && isGeldigeBoekdag(invoer.tot) && invoer.van <= invoer.tot, "Het boekjaar heeft een geldige begin- en einddatum nodig (jjjj-mm-dd).");
  eis(isGeldigeBoekdag(invoer.aangemaakt), "De aanmaakdatum is geen geldige dag (jjjj-mm-dd).");
  eis(Number.isInteger(invoer.startMaand) && invoer.startMaand >= 1 && invoer.startMaand <= 12, "De startmaand van het boekjaar is 1 t/m 12.");
  eis(/^[A-Z]{2}$/.test(invoer.bedrijf.land), "Het land van de administratie is een code van twee hoofdletters.");

  // rekeningschema: dubbele nummers zijn fout, de samengestelde openingsrekening komt erbij als dat nodig is
  const rekeningen = new Map<string, ExportRekening>();
  for (const r of invoer.rekeningen) {
    eis(!rekeningen.has(r.nummer), `Rekeningnummer ${r.nummer} staat twee keer in het rekeningschema.`);
    eis(r.nummer.trim() !== "", "Een rekening heeft een nummer nodig.");
    rekeningen.set(r.nummer, r);
  }
  const heeftVorigResultaat = invoer.opening.some((o) => o.rekeningNummer === RESULTAAT_VORIG_NUMMER);
  if (heeftVorigResultaat && !rekeningen.has(RESULTAAT_VORIG_NUMMER)) {
    rekeningen.set(RESULTAAT_VORIG_NUMMER, { nummer: RESULTAAT_VORIG_NUMMER, naam: RESULTAAT_VORIG_NAAM, soort: "PASSIVA" });
  }
  const bestaat = (nummer: string, waar: string): ExportRekening => {
    const r = rekeningen.get(nummer);
    if (!r) throw AppError.validation(`${waar} verwijst naar rekening ${nummer}, die niet in het rekeningschema staat.`);
    return r;
  };

  // openingsbalans
  let openDebet = 0;
  let openCredit = 0;
  const openingRegels = invoer.opening.filter((o) => o.debetCents !== 0 || o.creditCents !== 0);
  for (const o of openingRegels) {
    const r = bestaat(o.rekeningNummer, "De openingsbalans");
    eis(isBalansSoort(r.soort), `Rekening ${o.rekeningNummer} is geen balansrekening en heeft dus geen openingssaldo.`);
    eis(isGeheleCenten(o.debetCents) && isGeheleCenten(o.creditCents) && (o.debetCents > 0) !== (o.creditCents > 0), `Het openingssaldo van rekening ${o.rekeningNummer} heeft precies één kant, groter dan 0.`);
    openDebet += o.debetCents;
    openCredit += o.creditCents;
  }
  eis(openDebet === openCredit, `De openingsbalans sluit niet: debet ${xafBedrag(openDebet)} is niet gelijk aan credit ${xafBedrag(openCredit)}.`);

  // boekingen per dagboek
  const perDagboek = new Map<string, XafBoeking[]>();
  const stukken = new Set<string>();
  let linesCount = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  for (const b of invoer.boekingen) {
    eis(b.valuta === invoer.valuta, `Boeking ${b.boekstuk} staat in ${b.valuta}, maar deze administratie boekt in ${invoer.valuta}. Valuta's worden niet gemengd.`);
    eis(isGeldigeBoekdag(b.datum), `Boeking ${b.boekstuk} heeft geen geldige datum (jjjj-mm-dd).`);
    eis(b.datum >= invoer.van && b.datum <= invoer.tot, `Boeking ${b.boekstuk} valt buiten het boekjaar.`);
    eis(!stukken.has(b.boekstuk), `Boekstuknummer ${b.boekstuk} komt twee keer voor.`);
    stukken.add(b.boekstuk);
    eis(b.regels.length >= 2, `Boeking ${b.boekstuk} heeft minstens twee regels.`);
    let d = 0;
    let c = 0;
    for (const [i, regel] of b.regels.entries()) {
      bestaat(regel.rekeningNummer, `Boeking ${b.boekstuk}, regel ${i + 1}`);
      eis(isGeheleCenten(regel.debetCents) && isGeheleCenten(regel.creditCents) && regel.debetCents >= 0 && regel.creditCents >= 0 && (regel.debetCents > 0) !== (regel.creditCents > 0), `Boeking ${b.boekstuk}, regel ${i + 1}: een regel heeft precies één kant, groter dan 0.`);
      d += regel.debetCents;
      c += regel.creditCents;
    }
    eis(d === c, `Boeking ${b.boekstuk} sluit niet: debet ${xafBedrag(d)} is niet gelijk aan credit ${xafBedrag(c)}.`);
    linesCount += b.regels.length;
    totalDebit += d;
    totalCredit += c;
    const lijst = perDagboek.get(b.dagboek);
    if (lijst) lijst.push(b);
    else perDagboek.set(b.dagboek, [b]);
  }
  eis(totalDebit === totalCredit, "De totalen van de auditfile sluiten niet: debet is niet gelijk aan credit.");

  const w = new Schrijver();
  w.open(E.root, ` xmlns="${xmlTekst(XAF_CONFIG.namespace)}"`);

  w.open(E.header);
  w.tekst(E.fiscalYear, String(invoer.jaar));
  w.tekst(E.startDate, invoer.van);
  w.tekst(E.endDate, invoer.tot);
  w.tekst(E.curCode, invoer.valuta);
  w.tekst(E.dateCreated, invoer.aangemaakt);
  w.tekst(E.softwareDesc, XAF_CONFIG.softwareDesc);
  w.tekst(E.softwareVersion, XAF_CONFIG.softwareVersion);
  w.sluit(E.header);

  w.open(E.company);
  w.tekst(E.companyIdent, invoer.bedrijf.id);
  w.tekst(E.companyName, invoer.bedrijf.naam);
  w.tekst(E.taxRegistrationCountry, invoer.bedrijf.land);
  if (invoer.bedrijf.btwNummer) w.tekst(E.taxRegIdent, invoer.bedrijf.btwNummer);
  if (invoer.bedrijf.adres) w.tekst(E.streetAddress, invoer.bedrijf.adres);
  w.leeg(E.customersSuppliers);

  w.open(E.generalLedger);
  const gesorteerd = [...rekeningen.values()].sort((a, b) => a.nummer.localeCompare(b.nummer, "nl", { numeric: true }));
  for (const r of gesorteerd) {
    w.open(E.ledgerAccount);
    w.tekst(E.accID, r.nummer);
    w.tekst(E.accDesc, r.naam);
    w.tekst(E.accTp, isBalansSoort(r.soort) ? XAF_CONFIG.accTpBalans : XAF_CONFIG.accTpWinstVerlies);
    w.tekst(E.glAccountType, XAF_CONFIG.glAccountType[r.soort]);
    w.sluit(E.ledgerAccount);
  }
  w.sluit(E.generalLedger);

  w.open(E.periods);
  for (const p of periodenLijst(invoer.jaar, invoer.startMaand)) {
    w.open(E.period);
    w.tekst(E.periodNumber, String(p.nr));
    w.tekst(E.periodDesc, p.omschrijving);
    w.tekst(E.startDatePeriod, p.van);
    w.tekst(E.endDatePeriod, p.tot);
    w.sluit(E.period);
  }
  w.sluit(E.periods);

  if (openingRegels.length > 0) {
    w.open(E.openingBalance);
    w.tekst(E.opBalDate, invoer.van);
    w.tekst(E.opBalDesc, XAF_CONFIG.openingOmschrijving);
    w.tekst(E.linesCount, String(openingRegels.length));
    w.tekst(E.totalDebit, xafBedrag(openDebet));
    w.tekst(E.totalCredit, xafBedrag(openCredit));
    for (const [i, o] of openingRegels.entries()) {
      w.open(E.obLine);
      w.tekst(E.lineNr, String(i + 1));
      w.tekst(E.lineAccID, o.rekeningNummer);
      w.tekst(E.lineAmnt, xafBedrag(o.debetCents > 0 ? o.debetCents : o.creditCents));
      w.tekst(E.lineAmntTp, o.debetCents > 0 ? XAF_CONFIG.debet : XAF_CONFIG.credit);
      w.sluit(E.obLine);
    }
    w.sluit(E.openingBalance);
  }

  w.open(E.transactions);
  w.tekst(E.linesCount, String(linesCount));
  w.tekst(E.totalDebit, xafBedrag(totalDebit));
  w.tekst(E.totalCredit, xafBedrag(totalCredit));
  for (const [dagboek, lijst] of [...perDagboek.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    w.open(E.journal);
    w.tekst(E.jrnID, dagboek);
    w.tekst(E.jrnDesc, XAF_CONFIG.journaalOmschrijving[dagboek] ?? dagboek);
    w.tekst(E.jrnTp, XAF_CONFIG.journaalType[dagboek] ?? "O");
    for (const b of [...lijst].sort((x, y) => x.datum.localeCompare(y.datum) || x.boekstuk.localeCompare(y.boekstuk))) {
      const debetTotaal = b.regels.reduce((s, r) => s + r.debetCents, 0);
      w.open(E.transaction);
      w.tekst(E.trNr, b.boekstuk);
      w.tekstOfLeeg(E.trDesc, b.omschrijving);
      w.tekst(E.trPeriodNumber, String(periodeNummer(b.datum, invoer.startMaand)));
      w.tekst(E.trDt, b.datum);
      w.tekst(E.trAmnt, xafBedrag(debetTotaal));
      w.tekst(E.trAmntTp, XAF_CONFIG.debet);
      for (const [i, r] of b.regels.entries()) {
        w.open(E.trLine);
        w.tekst(E.lineNr, String(i + 1));
        w.tekst(E.lineAccID, r.rekeningNummer);
        w.tekst(E.lineDocRef, b.docRef);
        w.tekst(E.lineEffDate, b.datum);
        w.tekstOfLeeg(E.lineDesc, r.omschrijving ?? b.omschrijving);
        w.tekst(E.lineAmnt, xafBedrag(r.debetCents > 0 ? r.debetCents : r.creditCents));
        w.tekst(E.lineAmntTp, r.debetCents > 0 ? XAF_CONFIG.debet : XAF_CONFIG.credit);
        w.sluit(E.trLine);
      }
      w.sluit(E.transaction);
    }
    w.sluit(E.journal);
  }
  w.sluit(E.transactions);

  w.sluit(E.company);
  w.sluit(E.root);

  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n${w.uit()}\n`,
    linesCount,
    transactieAantal: invoer.boekingen.length,
    totalDebitCents: totalDebit,
    totalCreditCents: totalCredit,
  };
}
