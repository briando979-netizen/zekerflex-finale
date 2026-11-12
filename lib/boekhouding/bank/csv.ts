// ---------------------------------------------------------------------------
// Bank: CSV-afschriften van ING, Rabobank en ABN AMRO en een generieke CSV inlezen (puur). We herkennen het formaat aan de
// kolomkoppen; herkennen we niets, dan melden we dat ("formaat niet herkend") in plaats van te gokken.
//
// LET OP, door een echt voorbeeldbestand van de bank te bevestigen: de kolomindelingen hieronder komen uit onze kennis
// van de gangbare exports (ING "Naam / Omschrijving, Rekening, Tegenrekening, Code, Af Bij, Bedrag (EUR), Mutatiesoort,
// Mededelingen"; Rabobank "IBAN/BBAN, Munt, BIC, Volgnr, Datum, Rentedatum, Bedrag, Saldo na trn, Tegenrekening
// IBAN/BBAN, Naam tegenpartij, ... Omschrijving-1..3"; ABN AMRO de tab-gescheiden txt zonder kopregel met acht kolommen:
// rekening, munt, datum, beginsaldo, eindsaldo, rentedatum, bedrag, omschrijving). Banken wijzigen hun exports soms;
// er is nog met geen enkel echt bestand getest.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { saldoWaarschuwing } from "./saldo";
import { bedragNaarCenten, datumNaarDag, ibanOfNull, isGeldigIban, normaliseerIban, schoonTekst } from "./tekst";
import type { BankAfschriftData, BankRegel } from "./types";

type Scheiding = ";" | "," | "\t";

/** Splitst CSV-tekst in rijen van velden: aanhalingstekens (met "" als aanhalingsteken), ; , of tab, \r\n of \n. */
export function splitsCsv(tekst: string, scheiding: Scheiding): string[][] {
  const rijen: string[][] = [];
  let rij: string[] = [];
  let veld = "";
  let tussen = false;
  let veldGestart = false;
  const n = tekst.length;
  for (let i = 0; i < n; i += 1) {
    const c = tekst[i] as string;
    if (tussen) {
      if (c === '"') {
        if (tekst[i + 1] === '"') {
          veld += '"';
          i += 1;
        } else tussen = false;
      } else veld += c;
    } else if (c === '"' && veld === "") {
      tussen = true;
      veldGestart = true;
    } else if (c === scheiding) {
      rij.push(veld);
      veld = "";
      veldGestart = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && tekst[i + 1] === "\n") i += 1;
      rij.push(veld);
      veld = "";
      veldGestart = false;
      if (rij.length > 1 || (rij[0] ?? "").trim() !== "") rijen.push(rij);
      rij = [];
    } else {
      veld += c;
      veldGestart = true;
    }
  }
  if (tussen) throw AppError.validation("Het csv-bestand klopt niet: er is een aanhalingsteken dat niet wordt afgesloten.");
  if (veldGestart || veld !== "" || rij.length > 0) {
    rij.push(veld);
    if (rij.length > 1 || (rij[0] ?? "").trim() !== "") rijen.push(rij);
  }
  return rijen;
}

/** Het scheidingsteken van de eerste regel: het teken dat het vaakst voorkomt buiten aanhalingstekens. */
export function kiesScheiding(tekst: string): Scheiding {
  const eersteRegel = tekst.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const telling: Record<Scheiding, number> = { ";": 0, ",": 0, "\t": 0 };
  let tussen = false;
  for (const c of eersteRegel) {
    if (c === '"') tussen = !tussen;
    else if (!tussen && (c === ";" || c === "," || c === "\t")) telling[c] += 1;
  }
  const volgorde: Scheiding[] = ["\t", ";", ","];
  return volgorde.reduce((beste, s) => (telling[s] > telling[beste] ? s : beste), ";" as Scheiding);
}

const koptekst = (k: string): string => k.replace(/^﻿/, "").replace(/\s+/g, " ").trim().toLowerCase();

function kolom(kop: readonly string[], namen: readonly string[]): number {
  for (const naam of namen) {
    const i = kop.indexOf(naam);
    if (i >= 0) return i;
  }
  return -1;
}

const cel = (rij: readonly string[], i: number): string => (i >= 0 ? (rij[i] ?? "").trim() : "");

class RijFouten {
  readonly lijst: string[] = [];
  voeg(regel: number, tekst: string): void {
    if (this.lijst.length < 3) this.lijst.push(`Regel ${regel}: ${tekst}`);
    this.aantal += 1;
  }
  aantal = 0;
  gooi(): void {
    if (this.aantal === 0) return;
    const meer = this.aantal > this.lijst.length ? ` (en nog ${this.aantal - this.lijst.length} regel(s) met een probleem)` : "";
    throw AppError.validation(`Het bestand kon niet worden ingelezen. ${this.lijst.join(" ")}${meer}`);
  }
}

interface RuweRij {
  regel: number;
  regelData: BankRegel;
  /** het saldo na deze mutatie, als het bestand dat geeft */
  saldoNaCents: number | null;
}

/** Controleert of de saldokolom sluit (oplopend of aflopend), en geeft begin- en eindsaldo als dat zo is. */
function saldoKeten(rijen: readonly RuweRij[]): { begin: number; eind: number } | null | "sluit-niet" {
  if (rijen.length === 0 || rijen.some((r) => r.saldoNaCents === null)) return null;
  const probeer = (lijst: readonly RuweRij[]): { begin: number; eind: number } | null => {
    for (let i = 1; i < lijst.length; i += 1) {
      const vorig = lijst[i - 1] as RuweRij;
      const nu = lijst[i] as RuweRij;
      if ((vorig.saldoNaCents as number) + nu.regelData.bedragCents !== (nu.saldoNaCents as number)) return null;
    }
    const eerste = lijst[0] as RuweRij;
    const laatste = lijst[lijst.length - 1] as RuweRij;
    return { begin: (eerste.saldoNaCents as number) - eerste.regelData.bedragCents, eind: laatste.saldoNaCents as number };
  };
  return probeer(rijen) ?? probeer([...rijen].reverse()) ?? "sluit-niet";
}

function maakAfschrift(
  herkend: string,
  rijen: readonly RuweRij[],
  rekeningIban: string | null,
  valuta: string,
): BankAfschriftData {
  const regels = rijen.map((r) => r.regelData);
  const dagen = regels.map((r) => r.boekdag).sort();
  const waarschuwingen: string[] = [];
  const munten = new Set(rijen.map((r) => r.regelData.valuta));
  if (munten.size > 1) waarschuwingen.push("Het bestand bevat meer dan één munt; de rekening neemt alleen een afschrift in de eigen munt aan.");
  let begin: number | null = null;
  let eind: number | null = null;
  const keten = saldoKeten(rijen);
  if (keten === "sluit-niet") {
    waarschuwingen.push("De saldokolom in het bestand sluit niet aan op de mutaties: controleer of er transacties ontbreken.");
  } else if (keten) {
    begin = keten.begin;
    eind = keten.eind;
    const w = saldoWaarschuwing(begin, eind, regels.map((r) => r.bedragCents), valuta);
    if (w) waarschuwingen.push(w);
  }
  return {
    formaat: "CSV",
    herkend,
    rekeningIban,
    afschriftNummer: null,
    vanaf: dagen[0] ?? null,
    totEnMet: dagen[dagen.length - 1] ?? null,
    beginSaldoCents: begin,
    eindSaldoCents: eind,
    valuta,
    transacties: regels,
    waarschuwingen,
  };
}

/** Alle eigen rekeningen in de rijen moeten dezelfde zijn. */
function eenRekening(ibans: readonly string[]): string | null {
  const unieke = new Set(ibans.filter(Boolean).map(normaliseerIban));
  if (unieke.size > 1) throw AppError.validation("Dit bestand bevat mutaties van meerdere bankrekeningen. Exporteer per rekening.");
  const [iban] = [...unieke];
  return iban && isGeldigIban(iban) ? iban : null;
}

// ---- ING -------------------------------------------------------------------

const ING_KOPPEN = {
  datum: ["datum", "date"],
  naam: ["naam / omschrijving", "name / description"],
  rekening: ["rekening", "account"],
  tegen: ["tegenrekening", "counterparty"],
  afBij: ["af bij", "debit/credit"],
  bedrag: ["bedrag (eur)", "amount (eur)"],
  soort: ["mutatiesoort", "transaction type"],
  mededelingen: ["mededelingen", "notifications"],
  saldo: ["saldo na mutatie", "resulting balance"],
} as const;

function lijktOpIng(kop: readonly string[]): boolean {
  return kolom(kop, ING_KOPPEN.afBij) >= 0 && kolom(kop, ING_KOPPEN.naam) >= 0 && kolom(kop, ING_KOPPEN.bedrag) >= 0 && kolom(kop, ING_KOPPEN.datum) >= 0;
}

function leesIng(kop: readonly string[], data: readonly string[][]): BankAfschriftData {
  const k = Object.fromEntries(Object.entries(ING_KOPPEN).map(([naam, namen]) => [naam, kolom(kop, namen)])) as Record<keyof typeof ING_KOPPEN, number>;
  const fouten = new RijFouten();
  const rijen: RuweRij[] = [];
  data.forEach((r, i) => {
    const regel = i + 2;
    const dag = datumNaarDag(cel(r, k.datum));
    const centen = bedragNaarCenten(cel(r, k.bedrag));
    const richting = cel(r, k.afBij).toLowerCase();
    const af = richting === "af" || richting === "debit";
    const bij = richting === "bij" || richting === "credit";
    if (!dag) return fouten.voeg(regel, "de datum is niet te lezen.");
    if (centen === null) return fouten.voeg(regel, "het bedrag is niet te lezen.");
    if (!af && !bij) return fouten.voeg(regel, "Af/Bij is niet te lezen.");
    const saldo = k.saldo >= 0 ? bedragNaarCenten(cel(r, k.saldo)) : null;
    const tegen = cel(r, k.tegen);
    rijen.push({
      regel,
      saldoNaCents: saldo,
      regelData: {
        boekdag: dag,
        valutadag: null,
        bedragCents: af ? -Math.abs(centen) : Math.abs(centen),
        valuta: "EUR",
        tegenIban: ibanOfNull(tegen),
        tegenNaam: schoonTekst(cel(r, k.naam), 140),
        omschrijving: schoonTekst([cel(r, k.mededelingen), tegen && !ibanOfNull(tegen) ? `Tegenrekening ${tegen}` : ""].filter(Boolean).join(" ")),
        endToEndId: null,
        bankReferentie: null,
      },
    });
  });
  fouten.gooi();
  const iban = eenRekening(data.map((r) => cel(r, k.rekening)));
  return maakAfschrift("ING (csv)", rijen, iban, "EUR");
}

// ---- Rabobank --------------------------------------------------------------

const RABO_KOPPEN = {
  iban: ["iban/bban"],
  munt: ["munt"],
  volgnr: ["volgnr"],
  datum: ["datum"],
  rentedatum: ["rentedatum"],
  bedrag: ["bedrag"],
  saldo: ["saldo na trn"],
  tegen: ["tegenrekening iban/bban"],
  naam: ["naam tegenpartij"],
  eindNaam: ["naam uiteindelijke partij"],
  endToEnd: ["transactiereferentie"],
  kenmerk: ["betalingskenmerk"],
  o1: ["omschrijving-1"],
  o2: ["omschrijving-2"],
  o3: ["omschrijving-3"],
} as const;

function lijktOpRabo(kop: readonly string[]): boolean {
  return kolom(kop, RABO_KOPPEN.iban) >= 0 && kolom(kop, RABO_KOPPEN.datum) >= 0 && kolom(kop, RABO_KOPPEN.bedrag) >= 0 && kolom(kop, RABO_KOPPEN.volgnr) >= 0;
}

function leesRabo(kop: readonly string[], data: readonly string[][]): BankAfschriftData {
  const k = Object.fromEntries(Object.entries(RABO_KOPPEN).map(([naam, namen]) => [naam, kolom(kop, namen)])) as Record<keyof typeof RABO_KOPPEN, number>;
  const fouten = new RijFouten();
  const rijen: RuweRij[] = [];
  data.forEach((r, i) => {
    const regel = i + 2;
    const dag = datumNaarDag(cel(r, k.datum));
    const centen = bedragNaarCenten(cel(r, k.bedrag));
    if (!dag) return fouten.voeg(regel, "de datum is niet te lezen.");
    if (centen === null) return fouten.voeg(regel, "het bedrag is niet te lezen.");
    const volgnr = cel(r, k.volgnr);
    const kenmerk = cel(r, k.kenmerk);
    const omschr = [cel(r, k.o1), cel(r, k.o2), cel(r, k.o3), kenmerk ? `Kenmerk ${kenmerk}` : ""].filter(Boolean).join(" ");
    const e2e = cel(r, k.endToEnd);
    rijen.push({
      regel,
      saldoNaCents: k.saldo >= 0 ? bedragNaarCenten(cel(r, k.saldo)) : null,
      regelData: {
        boekdag: dag,
        valutadag: datumNaarDag(cel(r, k.rentedatum)),
        bedragCents: centen,
        valuta: (cel(r, k.munt) || "EUR").toUpperCase(),
        tegenIban: ibanOfNull(cel(r, k.tegen)),
        tegenNaam: schoonTekst(cel(r, k.naam) || cel(r, k.eindNaam), 140),
        omschrijving: schoonTekst(omschr),
        endToEndId: e2e ? e2e.slice(0, 100) : null,
        // Het volgnummer loopt per rekening door: samen met de dag een vaste sleutel.
        bankReferentie: volgnr ? `${dag}#${volgnr}` : null,
      },
    });
  });
  fouten.gooi();
  const iban = eenRekening(data.map((r) => cel(r, k.iban)));
  return maakAfschrift("Rabobank (csv)", rijen, iban, rijen[0]?.regelData.valuta ?? "EUR");
}

// ---- ABN AMRO (tab, zonder kopregel) ---------------------------------------

function lijktOpAbnTab(eersteRij: readonly string[]): boolean {
  return eersteRij.length >= 8 && /^[A-Z]{3}$/.test(cel(eersteRij, 1)) && /^\d{8}$/.test(cel(eersteRij, 2)) && /^\d{8}$/.test(cel(eersteRij, 5)) && bedragNaarCenten(cel(eersteRij, 6)) !== null;
}

const ABN_LABELS = "Omschrijving|Kenmerk|Machtiging|Incassant|Betalingskenmerk|IBAN|BIC|Naam|Datum";

function leesAbnTab(rijen: readonly string[][]): BankAfschriftData {
  const fouten = new RijFouten();
  const uit: RuweRij[] = [];
  const beginEinde: { begin: number; eind: number }[] = [];
  rijen.forEach((r, i) => {
    const regel = i + 1;
    const dag = datumNaarDag(cel(r, 2));
    const centen = bedragNaarCenten(cel(r, 6));
    const begin = bedragNaarCenten(cel(r, 3));
    const eind = bedragNaarCenten(cel(r, 4));
    if (!dag) return fouten.voeg(regel, "de datum is niet te lezen.");
    if (centen === null) return fouten.voeg(regel, "het bedrag is niet te lezen.");
    const tekst = r.slice(7).join(" ").replace(/\s+/g, " ").trim();
    const iban = /IBAN:\s*([A-Z]{2}\d{2}[A-Z0-9]{10,30})/.exec(tekst)?.[1] ?? null;
    const naam = new RegExp(`Naam:\\s*(.*?)\\s*(?:(?:${ABN_LABELS}):|$)`).exec(tekst)?.[1] ?? null;
    if (begin !== null && eind !== null) beginEinde.push({ begin, eind });
    uit.push({
      regel,
      saldoNaCents: eind,
      regelData: {
        boekdag: dag,
        valutadag: datumNaarDag(cel(r, 5)),
        bedragCents: centen,
        valuta: cel(r, 1).toUpperCase(),
        tegenIban: ibanOfNull(iban),
        tegenNaam: schoonTekst(naam, 140),
        omschrijving: schoonTekst(tekst),
        endToEndId: null,
        bankReferentie: null,
      },
    });
  });
  fouten.gooi();
  const iban = eenRekening(rijen.map((r) => cel(r, 0)).filter((x) => isGeldigIban(x)));
  return maakAfschrift("ABN AMRO (tab-txt)", uit, iban, uit[0]?.regelData.valuta ?? "EUR");
}

// ---- Generiek --------------------------------------------------------------

const GENERIEK = {
  datum: ["datum", "boekdatum", "boekingsdatum", "transactiedatum", "date", "booking date", "transaction date"],
  valutadatum: ["valutadatum", "rentedatum", "value date"],
  bedrag: ["bedrag", "bedrag (eur)", "bedrag eur", "amount", "amount (eur)", "transactiebedrag"],
  afBij: ["af bij", "af/bij", "debit/credit", "debet/credit", "dc"],
  tegenIban: ["tegenrekening", "tegenrekening iban", "tegenrekening iban/bban", "iban tegenpartij", "counterparty iban", "tegenrekeningnummer"],
  naam: ["naam", "naam tegenpartij", "tegenpartij", "naam / omschrijving", "name", "counterparty name", "begunstigde", "beneficiary"],
  omschrijving: ["omschrijving", "omschrijving-1", "mededelingen", "description", "details", "notifications", "omschrijving transactie"],
  valuta: ["valuta", "munt", "currency", "currency code"],
  referentie: ["bankreferentie", "boekingsreferentie", "transactie id", "transactie-id", "transaction id"],
  eigenIban: ["rekening", "eigen rekening", "iban/bban", "account"],
} as const;

function lijktOpGeneriek(kop: readonly string[]): boolean {
  return kolom(kop, GENERIEK.datum) >= 0 && kolom(kop, GENERIEK.bedrag) >= 0;
}

function leesGeneriek(kop: readonly string[], data: readonly string[][]): BankAfschriftData {
  const k = Object.fromEntries(Object.entries(GENERIEK).map(([naam, namen]) => [naam, kolom(kop, namen)])) as Record<keyof typeof GENERIEK, number>;
  const fouten = new RijFouten();
  const rijen: RuweRij[] = [];
  data.forEach((r, i) => {
    const regel = i + 2;
    const dag = datumNaarDag(cel(r, k.datum));
    const centen = bedragNaarCenten(cel(r, k.bedrag));
    if (!dag) return fouten.voeg(regel, "de datum is niet te lezen.");
    if (centen === null) return fouten.voeg(regel, "het bedrag is niet te lezen.");
    let bedrag = centen;
    if (k.afBij >= 0) {
      const richting = cel(r, k.afBij).toLowerCase();
      if (["af", "debet", "debit", "d", "db"].includes(richting)) bedrag = -Math.abs(centen);
      else if (["bij", "credit", "c", "cr"].includes(richting)) bedrag = Math.abs(centen);
      else return fouten.voeg(regel, "Af/Bij is niet te lezen.");
    }
    const ref = cel(r, k.referentie);
    rijen.push({
      regel,
      saldoNaCents: null,
      regelData: {
        boekdag: dag,
        valutadag: k.valutadatum >= 0 ? datumNaarDag(cel(r, k.valutadatum)) : null,
        bedragCents: bedrag,
        valuta: (cel(r, k.valuta) || "EUR").toUpperCase(),
        tegenIban: ibanOfNull(cel(r, k.tegenIban)),
        tegenNaam: schoonTekst(cel(r, k.naam), 140),
        omschrijving: schoonTekst(cel(r, k.omschrijving)),
        endToEndId: null,
        bankReferentie: ref ? ref.slice(0, 100) : null,
      },
    });
  });
  fouten.gooi();
  const iban = k.eigenIban >= 0 ? eenRekening(data.map((r) => cel(r, k.eigenIban)).filter((x) => isGeldigIban(x))) : null;
  return maakAfschrift("Algemene csv (kolommen herkend op de kopregel)", rijen, iban, rijen[0]?.regelData.valuta ?? "EUR");
}

/** Leest een csv/tekstbestand. Geeft AppError.validation met "formaat niet herkend" als er geen bekend formaat in zit. */
export function leesCsvAfschrift(tekst: string): BankAfschriftData {
  const scheiding = kiesScheiding(tekst);
  const alle = splitsCsv(tekst, scheiding);
  const eerste = alle[0];
  if (!eerste) throw AppError.validation("Het bestand is leeg.");

  if (scheiding === "\t" && lijktOpAbnTab(eerste)) return leesAbnTab(alle);

  const kop = eerste.map(koptekst);
  const data = alle.slice(1);
  const kies = (): ((kop: readonly string[], data: readonly string[][]) => BankAfschriftData) | null => {
    if (lijktOpIng(kop)) return leesIng;
    if (lijktOpRabo(kop)) return leesRabo;
    if (lijktOpGeneriek(kop)) return leesGeneriek;
    return null;
  };
  const lezer = kies();
  if (!lezer) {
    const gezien = kop.slice(0, 8).map((x) => x.slice(0, 30)).join(", ");
    throw AppError.validation(
      `Formaat niet herkend. We lezen CAMT.053 (xml) en csv-bestanden van ING, Rabobank en ABN AMRO, of een csv met minstens de kolommen Datum en Bedrag. De eerste kolommen van dit bestand zijn: ${gezien || "(geen)"}. Exporteer het afschrift opnieuw als CAMT.053 of stuur een voorbeeld op.`,
    );
  }
  if (data.length === 0) throw AppError.validation("Het bestand heeft een kopregel maar geen transacties.");
  return lezer(kop, data);
}
