// ---------------------------------------------------------------------------
// Bank: CAMT.053 (ISO 20022 bank-naar-klant afschrift, XML) inlezen (puur). Gelezen: Stmt (afschriftnummer, rekening,
// openings- en eindsaldo), Ntry (bedrag, debet/credit, boek- en valutadatum, bankreferentie) en TxDtls (tegenpartij,
// IBAN, omschrijving, betalingskenmerk, EndToEndId). De bank-eigen varianten verschillen in details; waar een veld
// ontbreekt blijft het leeg. LET OP: dit is geschreven volgens de standaard en met zelfgemaakte voorbeeldbestanden
// getest; het moet nog met een echt bestand van de bank van de eigenaar worden bevestigd.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { saldoWaarschuwing } from "./saldo";
import { datumNaarDag, ibanOfNull, schoonTekst } from "./tekst";
import type { BankAfschriftData, BankRegel } from "./types";
import { kind, kinderen, leesXml, pad, tekstOp, type XmlElement } from "./xml";

/** Ziet dit eruit als een CAMT-bestand (XML met een Document-element)? Voor het kiezen van de lezer. */
export function lijktOpCamt(tekst: string): boolean {
  const begin = tekst.slice(0, 2000).trimStart();
  return begin.startsWith("<") && /<(\w+:)?Document[\s>]/.test(tekst.slice(0, 4000));
}

function bedragVan(el: XmlElement | undefined): { cents: number; valuta: string } | null {
  if (!el) return null;
  const ruw = el.tekst.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(ruw)) return null;
  const [hele, deel = ""] = ruw.split(".");
  const cents = Number(hele) * 100 + Number(deel.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return { cents, valuta: el.attrs.Ccy ?? "EUR" };
}

function metTeken(cents: number, richting: string | null): number | null {
  if (richting === "CRDT") return cents;
  if (richting === "DBIT") return -cents;
  return null;
}

function dagVan(el: XmlElement | undefined): string | null {
  if (!el) return null;
  const t = tekstOp(el, "Dt") ?? tekstOp(el, "DtTm");
  return t ? datumNaarDag(t) : null;
}

function saldoVan(stmt: XmlElement, codes: readonly string[]): { cents: number; valuta: string } | null {
  for (const bal of kinderen(stmt, "Bal")) {
    const code = tekstOp(bal, "Tp/CdOrPrtry/Cd");
    if (!code || !codes.includes(code)) continue;
    const b = bedragVan(kind(bal, "Amt"));
    const cents = b ? metTeken(b.cents, tekstOp(bal, "CdtDbtInd")) : null;
    if (b && cents !== null) return { cents, valuta: b.valuta };
  }
  return null;
}

function naamVan(partij: XmlElement | undefined): string | null {
  return schoonTekst(tekstOp(partij, "Nm") ?? tekstOp(partij, "Pty/Nm"), 140);
}

interface TxGegevens {
  tegenIban: string | null;
  tegenNaam: string | null;
  omschrijving: string | null;
  endToEndId: string | null;
  bankReferentie: string | null;
  /** het bedrag van deze transactie als het uit de details komt (batch), in centen zonder teken */
  bedragCents: number | null;
}

function leesTx(tx: XmlElement, inkomend: boolean): TxGegevens {
  const partijen = kind(tx, "RltdPties");
  // Bij een bijschrijving is de tegenpartij de debiteur (de betaler), bij een afschrijving de crediteur.
  const partij = kind(partijen, inkomend ? "Dbtr" : "Cdtr");
  const rekening = kind(partijen, inkomend ? "DbtrAcct" : "CdtrAcct");
  const iban = tekstOp(rekening, "Id/IBAN");
  const ustrd = kinderen(kind(tx, "RmtInf"), "Ustrd").map((u) => u.tekst.trim()).filter(Boolean);
  const kenmerk = kinderen(kind(tx, "RmtInf"), "Strd")
    .map((s) => tekstOp(s, "CdtrRefInf/Ref"))
    .filter((x): x is string => x !== null);
  const delen = [...ustrd, ...kenmerk.map((k) => `Kenmerk ${k}`)];
  const e2e = tekstOp(tx, "Refs/EndToEndId");
  const bedrag = bedragVan(pad(tx, "AmtDtls/TxAmt/Amt") ?? pad(tx, "Amt"));
  return {
    tegenIban: ibanOfNull(iban),
    tegenNaam: naamVan(partij) ?? naamVan(kind(partijen, inkomend ? "UltmtDbtr" : "UltmtCdtr")),
    omschrijving: schoonTekst(delen.join(" ")),
    endToEndId: e2e && e2e.toUpperCase() !== "NOTPROVIDED" ? e2e.slice(0, 100) : null,
    bankReferentie: schoonTekst(tekstOp(tx, "Refs/AcctSvcrRef"), 100),
    bedragCents: bedrag ? bedrag.cents : null,
  };
}

function leesStmt(stmt: XmlElement): { iban: string | null; ibanTekst: string | null; data: Omit<BankAfschriftData, "formaat" | "herkend"> } {
  const ibanTekst = tekstOp(stmt, "Acct/Id/IBAN");
  const iban = ibanOfNull(ibanTekst);
  const nummer = schoonTekst(tekstOp(stmt, "ElctrncSeqNb") ?? tekstOp(stmt, "LglSeqNb") ?? tekstOp(stmt, "Id"), 60);
  const begin = saldoVan(stmt, ["OPBD", "PRCD"]);
  const eind = saldoVan(stmt, ["CLBD"]);
  const stmtValuta = tekstOp(stmt, "Acct/Ccy") ?? begin?.valuta ?? eind?.valuta ?? null;

  const transacties: BankRegel[] = [];
  const waarschuwingen: string[] = [];
  let overgeslagen = 0;
  let gesplitst = 0;
  for (const [i, ntry] of kinderen(stmt, "Ntry").entries()) {
    const label = `Boeking ${i + 1}`;
    const status = tekstOp(ntry, "Sts") ?? tekstOp(ntry, "Sts/Cd");
    if (status && status !== "BOOK") {
      overgeslagen += 1;
      continue;
    }
    const b = bedragVan(kind(ntry, "Amt"));
    const richting = tekstOp(ntry, "CdtDbtInd");
    let cents = b ? metTeken(b.cents, richting) : null;
    if (!b || cents === null) throw AppError.validation(`${label} in het afschrift heeft geen leesbaar bedrag of geen debet/credit-aanduiding.`);
    if (tekstOp(ntry, "RvslInd")?.toLowerCase() === "true") cents = -cents; // een stornering draait de richting om
    const inkomend = cents > 0;
    const boekdag = dagVan(kind(ntry, "BookgDt"));
    if (!boekdag) throw AppError.validation(`${label} in het afschrift heeft geen leesbare boekdatum.`);
    const valutadag = dagVan(kind(ntry, "ValDt"));
    const entryRef = schoonTekst(tekstOp(ntry, "AcctSvcrRef"), 100);
    const extra = schoonTekst(tekstOp(ntry, "AddtlNtryInf"));

    const txs = kinderen(kind(ntry, "NtryDtls"), "TxDtls").map((t) => leesTx(t, inkomend));
    // Een batch (meerdere TxDtls) splitsen we alleen als de bedragen precies optellen tot het totaal van de boeking.
    const somTx = txs.reduce((s, t) => s + (t.bedragCents ?? 0), 0);
    const kanSplitsen = txs.length > 1 && txs.every((t) => t.bedragCents !== null) && somTx === Math.abs(cents);
    const basis = { boekdag, valutadag, valuta: b.valuta };
    if (kanSplitsen) {
      gesplitst += 1;
      for (const t of txs) {
        transacties.push({
          ...basis,
          bedragCents: cents > 0 ? (t.bedragCents as number) : -(t.bedragCents as number),
          tegenIban: t.tegenIban,
          tegenNaam: t.tegenNaam,
          omschrijving: t.omschrijving ?? extra,
          endToEndId: t.endToEndId,
          bankReferentie: t.bankReferentie ?? entryRef,
        });
      }
    } else {
      const eerste = txs[0];
      const omschr = schoonTekst(txs.map((t) => t.omschrijving).filter(Boolean).join(" ")) ?? extra;
      transacties.push({
        ...basis,
        bedragCents: cents,
        tegenIban: eerste?.tegenIban ?? null,
        tegenNaam: txs.length > 1 ? null : (eerste?.tegenNaam ?? null),
        omschrijving: omschr,
        endToEndId: eerste?.endToEndId ?? null,
        bankReferentie: entryRef ?? eerste?.bankReferentie ?? null,
      });
    }
  }
  if (overgeslagen > 0) waarschuwingen.push(`${overgeslagen} boeking(en) die nog niet definitief zijn (geen status BOOK) zijn overgeslagen.`);
  if (gesplitst > 0) waarschuwingen.push(`${gesplitst} verzamelboeking(en) zijn gesplitst in losse transacties.`);

  const valuta = stmtValuta ?? transacties[0]?.valuta ?? "EUR";
  const w = saldoWaarschuwing(begin?.cents ?? null, eind?.cents ?? null, transacties.map((t) => t.bedragCents), valuta, nummer ? `Afschrift ${nummer}` : "Het afschrift");
  if (w) waarschuwingen.push(w);

  const dagen = transacties.map((t) => t.boekdag).sort();
  return {
    iban,
    ibanTekst,
    data: {
      rekeningIban: iban,
      afschriftNummer: nummer,
      vanaf: dagen[0] ?? null,
      totEnMet: dagen[dagen.length - 1] ?? null,
      beginSaldoCents: begin?.cents ?? null,
      eindSaldoCents: eind?.cents ?? null,
      valuta,
      transacties,
      waarschuwingen,
    },
  };
}

/** Leest een CAMT.053-bestand (tekst). Meerdere afschriften van dezelfde rekening worden samengevoegd. */
export function leesCamt053(tekst: string): BankAfschriftData {
  const root = leesXml(tekst);
  if (root.naam !== "Document") throw AppError.validation("Dit XML-bestand is geen CAMT-bankafschrift (het hoofdelement is niet Document).");
  const dec = kind(root, "BkToCstmrStmt");
  if (!dec) {
    if (kind(root, "BkToCstmrAcctRpt") || kind(root, "BkToCstmrDbtCdtNtfctn")) {
      throw AppError.validation("Dit is een CAMT-bestand van een ander type (rapport of melding). We lezen alleen CAMT.053, het bankafschrift.");
    }
    throw AppError.validation("Dit XML-bestand bevat geen bankafschrift (CAMT.053: BkToCstmrStmt ontbreekt).");
  }
  const stmts = kinderen(dec, "Stmt");
  if (stmts.length === 0) throw AppError.validation("Het bankafschrift bevat geen afschrift (Stmt).");

  const gelezen = stmts.map(leesStmt);
  const eerste = gelezen[0];
  if (!eerste) throw AppError.validation("Het bankafschrift bevat geen afschrift (Stmt).");
  const ibans = new Set(gelezen.map((g) => g.iban ?? g.ibanTekst ?? ""));
  if (ibans.size > 1) {
    throw AppError.validation("Dit bestand bevat afschriften van meerdere bankrekeningen. Lees ze apart in, per rekening.");
  }
  if (gelezen.length === 1) return { formaat: "CAMT053", herkend: "CAMT.053 (xml)", ...eerste.data };

  const laatste = gelezen[gelezen.length - 1] as (typeof gelezen)[number];
  const alle = gelezen.flatMap((g) => g.data.transacties);
  const dagen = alle.map((t) => t.boekdag).sort();
  return {
    formaat: "CAMT053",
    herkend: "CAMT.053 (xml)",
    rekeningIban: eerste.data.rekeningIban,
    afschriftNummer: eerste.data.afschriftNummer,
    vanaf: dagen[0] ?? null,
    totEnMet: dagen[dagen.length - 1] ?? null,
    beginSaldoCents: eerste.data.beginSaldoCents,
    eindSaldoCents: laatste.data.eindSaldoCents,
    valuta: eerste.data.valuta,
    transacties: alle,
    waarschuwingen: gelezen.flatMap((g) => g.data.waarschuwingen),
  };
}
