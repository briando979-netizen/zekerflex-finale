// ---------------------------------------------------------------------------
// Boekhouding: de controle van een boeking voor het schrijven (puur, zonder prisma). Een boeking sluit op 0
// (debet = credit, in gehele centen), elke regel heeft precies een kant, een regel is hooguit 2.000.000.000 cent,
// de valuta klopt met de administratie en er staan geen persoonsgegevens in. De database controleert daarna nog
// eens met triggers (migratie 20261112100000_boekhouding): dit is de eerste en vriendelijkste laag.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { MAX_REGEL_CENTS, formatCenten, isGeheleCenten } from "./bedrag";
import { controleerGeenPersoonsgegevens } from "./omschrijving";
import { BOEK_BRONNEN, BOEK_DAGBOEKEN, type BoekInvoer } from "./types";

export interface Sluiting {
  debetTotaalCents: number;
  creditTotaalCents: number;
}

const VALUTA = /^[A-Z]{3}$/;
const DAG = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Is dit een bestaande kalenderdag in de vorm "2026-04-10"? */
export function isGeldigeBoekdag(dag: string): boolean {
  const m = DAG.exec(dag);
  if (!m) return false;
  const [jaar, maand, dagNr] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(jaar, maand - 1, dagNr));
  return d.getUTCFullYear() === jaar && d.getUTCMonth() === maand - 1 && d.getUTCDate() === dagNr;
}

/**
 * Controleert een boeking en geeft de totalen terug; gooit AppError.validation (422) met een Nederlandse tekst bij
 * de eerste fout. `administratieValuta` is de functionele valuta van de administratie.
 */
export function valideerBoeking(invoer: BoekInvoer, administratieValuta: string): Sluiting {
  if (!invoer.administratieId) throw AppError.validation("Een boeking hoort bij een administratie.");
  if (!(BOEK_DAGBOEKEN as readonly string[]).includes(invoer.dagboek)) {
    throw AppError.validation("Onbekend dagboek.");
  }
  if (!(BOEK_BRONNEN as readonly string[]).includes(invoer.bron)) {
    throw AppError.validation("Onbekende bron van de boeking.");
  }
  if (!isGeldigeBoekdag(invoer.datum)) {
    throw AppError.validation("De boekdatum is geen geldige dag (verwacht: JJJJ-MM-DD).");
  }
  const bronId = invoer.bronId.trim();
  if (!bronId || bronId.length > 200) {
    throw AppError.validation("De boeking heeft een bronnummer nodig (hooguit 200 tekens): daarmee wordt nooit dubbel geboekt.");
  }
  if (!VALUTA.test(invoer.valuta)) {
    throw AppError.validation("De valuta is een code van drie hoofdletters, bijvoorbeeld EUR.");
  }
  if (invoer.valuta !== administratieValuta) {
    throw AppError.validation(
      `De boeking is in ${invoer.valuta}, maar deze administratie boekt in ${administratieValuta}. Reken eerst om; een vreemde valuta staat alleen informatief op de regel.`,
    );
  }

  const omschrijving = invoer.omschrijving.trim();
  if (!omschrijving || omschrijving.length > 200) {
    throw AppError.validation("De boeking heeft een omschrijving nodig (hooguit 200 tekens).");
  }
  controleerGeenPersoonsgegevens(omschrijving, "De omschrijving");

  const reden = invoer.reden?.trim() ?? "";
  if ((invoer.bron === "MEMORIAAL" || invoer.bron === "TEGENBOEKING") && !reden) {
    throw AppError.validation("Een memoriaalboeking en een tegenboeking hebben een reden nodig.");
  }
  if (reden) {
    if (reden.length > 500) throw AppError.validation("De reden is te lang (hooguit 500 tekens).");
    controleerGeenPersoonsgegevens(reden, "De reden");
  }

  if (invoer.regels.length < 2) {
    throw AppError.validation("Een boeking heeft minstens twee regels.");
  }

  let debetTotaalCents = 0;
  let creditTotaalCents = 0;
  invoer.regels.forEach((regel, i) => {
    const nr = i + 1;
    if (!regel.rekeningId) throw AppError.validation(`Regel ${nr}: er is geen rekening gekozen.`);
    const debet = regel.debetCents ?? 0;
    const credit = regel.creditCents ?? 0;
    if (!isGeheleCenten(debet) || !isGeheleCenten(credit)) {
      throw AppError.validation(`Regel ${nr}: een bedrag is een geheel aantal centen.`);
    }
    if (debet < 0 || credit < 0) {
      throw AppError.validation(`Regel ${nr}: een bedrag is nooit negatief; boek de andere kant (debet of credit).`);
    }
    if ((debet > 0) === (credit > 0)) {
      throw AppError.validation(`Regel ${nr}: een regel heeft precies een kant: debet of credit, groter dan 0.`);
    }
    const bedrag = Math.max(debet, credit);
    if (bedrag > MAX_REGEL_CENTS) {
      throw AppError.validation(
        `Regel ${nr}: het bedrag (${formatCenten(bedrag, invoer.valuta)}) is te groot. Een regel mag hooguit ${formatCenten(MAX_REGEL_CENTS, invoer.valuta)} zijn; splits het bedrag over meer regels of laat het controleren.`,
      );
    }
    if (regel.btwBasisCents !== undefined && (!isGeheleCenten(regel.btwBasisCents) || regel.btwBasisCents < 0)) {
      throw AppError.validation(`Regel ${nr}: de btw-grondslag is een positief geheel aantal centen.`);
    }
    if (regel.origineleValuta !== undefined && !VALUTA.test(regel.origineleValuta)) {
      throw AppError.validation(`Regel ${nr}: de oorspronkelijke valuta is een code van drie hoofdletters.`);
    }
    for (const getal of [regel.origineelCents, regel.koersMicro]) {
      if (getal !== undefined && !isGeheleCenten(getal)) {
        throw AppError.validation(`Regel ${nr}: het oorspronkelijke bedrag en de koers zijn hele getallen.`);
      }
    }
    if (regel.omschrijving) controleerGeenPersoonsgegevens(regel.omschrijving, `Regel ${nr}: de omschrijving`);
    debetTotaalCents += debet;
    creditTotaalCents += credit;
  });

  if (debetTotaalCents !== creditTotaalCents) {
    throw AppError.validation(
      `De boeking sluit niet: debet ${formatCenten(debetTotaalCents, invoer.valuta)} is niet gelijk aan credit ${formatCenten(creditTotaalCents, invoer.valuta)}.`,
    );
  }
  return { debetTotaalCents, creditTotaalCents };
}
