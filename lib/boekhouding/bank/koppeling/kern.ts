// ---------------------------------------------------------------------------
// Bank-koppeling (PSD2 / open banking): de aanbieder-onafhankelijke vormen (puur, zonder prisma of netwerk).
// De rest van de boekhouding kent alleen dit smalle interface: haalTransacties(sinds) geeft dezelfde BankRegel's als de
// CAMT.053- en csv-lezer. Welke aanbieder erachter zit (Enable Banking, een directe bank-API, ...) is een implementatie.
// AVG: transacties bevatten naam en IBAN van tegenpartijen. In logs, fouten en het auditspoor nooit iets daarvan.
// ---------------------------------------------------------------------------

import type { BankRegel } from "../types";

/** Het smalle interface: de transacties van één bankrekening vanaf een dag (Amsterdamse dagsleutel, "2026-04-10"). */
export interface BankKoppeling {
  /** korte naam van de aanbieder, voor het scherm en het logboek */
  readonly aanbieder: string;
  /** Alleen geboekte transacties, oud naar nieuw niet gegarandeerd; dubbelen vangt de import (dedupeSleutels) op. */
  haalTransacties(sinds: string): Promise<BankRegel[]>;
}

export type BankKoppelingFoutCode =
  /** er is nog geen toestemming gegeven of de sleutels ontbreken */
  | "niet-ingesteld"
  /** de toestemming bij de bank is verlopen of ingetrokken: de eigenaar moet opnieuw toestemming geven */
  | "toestemming-verlopen"
  /** tijdelijk (te veel aanvragen, de bank of aanbieder is even weg): de volgende ronde probeert het opnieuw */
  | "tijdelijk"
  /** de aanbieder wees de aanvraag af of gaf een antwoord dat we niet begrijpen */
  | "afgewezen";

/** Een fout met een Nederlandse tekst voor de eigenaar. Bevat nooit een url, token of antwoord van de bank. */
export class BankKoppelingFout extends Error {
  constructor(
    readonly code: BankKoppelingFoutCode,
    bericht: string,
  ) {
    super(bericht);
    this.name = "BankKoppelingFout";
  }
}

/** Wat we per bankrekening bewaren (in KV; geen migratie). Het sessie-id staat versleuteld (sealSecret). */
export interface KoppelingStaat {
  aanbieder: string;
  /** het sessie-id van de aanbieder, versleuteld */
  sessieVerzegeld: string;
  /** de rekening-id's van de aanbieder die bij deze bankrekening horen (geen IBAN) */
  rekeningUid: string;
  /** tot wanneer de toestemming bij de bank geldt (ISO-tijdstip) */
  geldigTot: string;
  gekoppeldOp: string;
  /** laatste geslaagde ophaling (ISO-tijdstip) */
  laatsteSucces: string | null;
  /** laatste mislukte ophaling: alleen de code en het tijdstip, nooit het antwoord van de bank */
  laatsteFout: { code: BankKoppelingFoutCode; op: string } | null;
}

export type ToestemmingStand = "geldig" | "bijna-verlopen" | "verlopen";

/** Zoveel dagen vóór het verlopen vragen we de eigenaar om opnieuw toestemming te geven. */
export const WAARSCHUW_DAGEN = 14;
/** Een eerste ophaling gaat hooguit zoveel dagen terug (banken geven vaak maar 90 dagen). */
export const EERSTE_OPHALING_DAGEN = 90;
/** Elke volgende ophaling begint zoveel dagen vóór de laatste geslaagde, zodat een late boeking niet ontbreekt. */
export const OVERLAP_DAGEN = 3;

const DAG_MS = 86_400_000;

export function toestemmingStand(geldigTot: string, nu: Date, waarschuwDagen = WAARSCHUW_DAGEN): ToestemmingStand {
  const eind = Date.parse(geldigTot);
  if (!Number.isFinite(eind) || eind <= nu.getTime()) return "verlopen";
  return eind - nu.getTime() <= waarschuwDagen * DAG_MS ? "bijna-verlopen" : "geldig";
}

/** Hele dagen tot het verlopen (0 of lager = verlopen). */
export function dagenTotVerlopen(geldigTot: string, nu: Date): number {
  const eind = Date.parse(geldigTot);
  return Number.isFinite(eind) ? Math.floor((eind - nu.getTime()) / DAG_MS) : 0;
}

/** "2026-04-10" -> "2026-04-07" via Date.UTC (geen setDate op een tijdstip). */
export function dagMinDagen(dag: string, n: number): string {
  const [j, m, d] = dag.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(j, m - 1, d - n)).toISOString().slice(0, 10);
}

/** "2026-04-10" -> "2026-04-11". */
export function dagPlusEen(dag: string): string {
  return dagMinDagen(dag, -1);
}

/**
 * Vanaf welke dag we ophalen:
 *  - al eerder gelukt: de dag van die ophaling min een paar dagen overlap;
 *  - nog nooit gelukt: de dag ná de nieuwste transactie die er al staat (uit een bestand), zodat een eerder geüpload
 *    afschrift niet dubbel komt (de bankreferenties van de aanbieder en van een CAMT-bestand zijn niet dezelfde);
 *    staat er niets, dan hooguit EERSTE_OPHALING_DAGEN terug.
 */
export function bepaalSinds(o: { vandaag: string; laatsteSuccesDag: string | null; nieuwsteBestaandeBoekdag: string | null }): string {
  if (o.laatsteSuccesDag) return dagMinDagen(o.laatsteSuccesDag, OVERLAP_DAGEN);
  const grens = dagMinDagen(o.vandaag, EERSTE_OPHALING_DAGEN);
  if (!o.nieuwsteBestaandeBoekdag) return grens;
  const na = dagPlusEen(o.nieuwsteBestaandeBoekdag);
  return na > grens ? na : grens;
}

function celVeilig(s: string | null): string {
  const schoon = (s ?? "").replace(/[\r\n\t]+/g, " ").trim();
  return `"${schoon.replace(/"/g, '""')}"`;
}

/**
 * De regels als csv in de algemene indeling die csv.ts al leest (kopregel Datum;Bedrag;...;Bankreferentie). Dit is het
 * bestand dat de import bewaart (zeven jaar bewaarplicht, net als een geüpload afschrift) én dat hij weer inleest, zodat
 * er geen tweede weg naar BoekBankTransactie bestaat. Bedrag met punt en teken: "-12.50".
 */
export function regelsNaarCsv(eigenIban: string, regels: readonly BankRegel[]): string {
  const kop = "Datum;Valutadatum;Bedrag;Valuta;Tegenrekening;Naam tegenpartij;Omschrijving;Bankreferentie;Rekening";
  const rijen = regels.map((r) => {
    const teken = r.bedragCents < 0 ? "-" : "";
    const abs = Math.abs(r.bedragCents);
    const bedrag = `${teken}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
    return [
      r.boekdag,
      r.valutadag ?? "",
      bedrag,
      r.valuta,
      celVeilig(r.tegenIban),
      celVeilig(r.tegenNaam),
      celVeilig(r.omschrijving),
      celVeilig(r.bankReferentie),
      celVeilig(eigenIban),
    ].join(";");
  });
  return [kop, ...rijen].join("\n") + "\n";
}

/** Leest wat in KV staat voorzichtig terug: een kapotte waarde geeft null, nooit een gooi. */
export function leesStaat(ruw: unknown): KoppelingStaat | null {
  if (typeof ruw !== "object" || ruw === null) return null;
  const o = ruw as Record<string, unknown>;
  const tekst = (k: string): string | null => (typeof o[k] === "string" && (o[k] as string).length > 0 ? (o[k] as string) : null);
  const aanbieder = tekst("aanbieder");
  const sessieVerzegeld = tekst("sessieVerzegeld");
  const rekeningUid = tekst("rekeningUid");
  const geldigTot = tekst("geldigTot");
  const gekoppeldOp = tekst("gekoppeldOp");
  if (!aanbieder || !sessieVerzegeld || !rekeningUid || !geldigTot || !gekoppeldOp) return null;
  const fout = o.laatsteFout;
  const codes: BankKoppelingFoutCode[] = ["niet-ingesteld", "toestemming-verlopen", "tijdelijk", "afgewezen"];
  const laatsteFout =
    typeof fout === "object" && fout !== null && codes.includes((fout as { code?: BankKoppelingFoutCode }).code as BankKoppelingFoutCode) && typeof (fout as { op?: unknown }).op === "string"
      ? { code: (fout as { code: BankKoppelingFoutCode }).code, op: (fout as { op: string }).op }
      : null;
  return { aanbieder, sessieVerzegeld, rekeningUid, geldigTot, gekoppeldOp, laatsteSucces: tekst("laatsteSucces"), laatsteFout };
}
