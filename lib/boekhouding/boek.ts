// ---------------------------------------------------------------------------
// Boekhouding: boek() is de ENIGE schrijfroute voor boekingen. Wie anders schrijft (een script, handmatige SQL) loopt
// tegen de triggers van de migratie aan. boek() controleert eerst alles (sluiten op 0, gehele centen, hooguit
// 2.000.000.000 cent per regel, valuta, geen persoonsgegevens, periode niet vergrendeld), is idempotent op
// (administratie, bron, bronId) en geeft een gapvrij boekstuknummer uit een tellerrij in dezelfde transactie.
// Een fout herstel je niet door te wijzigen maar met keerOm(): een tegenboeking.
// ---------------------------------------------------------------------------

import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { boekDatum, formatBoekstuk, periodeVan } from "./boekstuk";
import { controleerGeenPersoonsgegevens, omschrijvingVoor } from "./omschrijving";
import { isGeldigeBoekdag, valideerBoeking } from "./sluiting";
import type { BoekInvoer, BoekResultaat, RegelInvoer } from "./types";

type Tx = Prisma.TransactionClient;

/** Schrijft een boeking binnen een lopende transactie (voor wie meerdere dingen in een transactie wil doen). */
export async function boekInTransactie(tx: Tx, invoer: BoekInvoer): Promise<BoekResultaat> {
  const administratie = await tx.boekAdministratie.findUnique({
    where: { id: invoer.administratieId },
    select: { id: true, valuta: true, actief: true },
  });
  if (!administratie) throw AppError.notFound("Deze administratie bestaat niet.");
  if (!administratie.actief) throw AppError.validation("Deze administratie is niet actief: er wordt niet meer in geboekt.");

  valideerBoeking(invoer, administratie.valuta);
  const bronId = invoer.bronId.trim();

  // Idempotent: dezelfde bron twee keer (cron, herstart, dubbele Stripe-melding) geeft dezelfde boeking.
  const bestaand = await tx.boekBoeking.findUnique({
    where: { administratieId_bron_bronId: { administratieId: invoer.administratieId, bron: invoer.bron, bronId } },
    select: { id: true, boekstuk: true },
  });
  if (bestaand) return { boekingId: bestaand.id, boekstuk: bestaand.boekstuk, nieuw: false };

  const { jaar, maand } = periodeVan(invoer.datum);
  const periode = await tx.boekPeriode.findUnique({
    where: { administratieId_jaar_maand: { administratieId: invoer.administratieId, jaar, maand } },
    select: { status: true },
  });
  if (periode?.status === "VERGRENDELD") {
    throw AppError.validation(
      `De periode ${jaar}-${String(maand).padStart(2, "0")} is vergrendeld: in die maand komt geen nieuwe boeking. Boek op een datum in een open periode, met een reden.`,
    );
  }

  // Alle rekeningen en btw-codes horen bij deze administratie; rekeningen zijn actief en boekbaar (geen kopje).
  const rekeningIds = [...new Set(invoer.regels.map((r) => r.rekeningId))];
  const rekeningen = await tx.boekRekening.findMany({
    where: { administratieId: invoer.administratieId, id: { in: rekeningIds } },
    select: { id: true, nummer: true, boekbaar: true, actief: true },
  });
  const perId = new Map(rekeningen.map((r) => [r.id, r] as const));
  for (const rekeningId of rekeningIds) {
    const r = perId.get(rekeningId);
    if (!r) throw AppError.validation("Een regel verwijst naar een rekening die niet bij deze administratie hoort.");
    if (!r.boekbaar) throw AppError.validation(`Rekening ${r.nummer} is een kopje: daar komen geen regels op.`);
    if (!r.actief) throw AppError.validation(`Rekening ${r.nummer} is niet meer actief.`);
  }
  const btwCodeIds = [...new Set(invoer.regels.flatMap((r) => (r.btwCodeId ? [r.btwCodeId] : [])))];
  if (btwCodeIds.length > 0) {
    const codes = await tx.boekBtwCode.count({ where: { administratieId: invoer.administratieId, id: { in: btwCodeIds } } });
    if (codes !== btwCodeIds.length) {
      throw AppError.validation("Een regel verwijst naar een btw-code die niet bij deze administratie hoort.");
    }
  }

  // Gapvrij boekstuknummer: de tellerrij wordt in deze transactie opgehoogd. Mislukt de boeking, dan rolt de teller mee terug.
  const teller = await tx.boekVolgnummer.upsert({
    where: { administratieId_dagboek_jaar: { administratieId: invoer.administratieId, dagboek: invoer.dagboek, jaar } },
    create: { administratieId: invoer.administratieId, dagboek: invoer.dagboek, jaar, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
    select: { lastValue: true },
  });
  const boekstuk = formatBoekstuk(invoer.dagboek, jaar, teller.lastValue);

  const reden = invoer.reden?.trim();
  const gemaakt = await tx.boekBoeking.create({
    data: {
      administratieId: invoer.administratieId,
      dagboek: invoer.dagboek,
      boekstuk,
      datum: boekDatum(invoer.datum),
      omschrijving: invoer.omschrijving.trim(),
      bron: invoer.bron,
      bronId,
      aangemaaktDoor: invoer.aangemaaktDoor ?? "systeem",
      ...(invoer.bronHash !== undefined ? { bronHash: invoer.bronHash } : {}),
      ...(reden ? { reden } : {}),
      ...(invoer.keertBoekingId !== undefined ? { keertBoekingId: invoer.keertBoekingId } : {}),
      regels: { create: invoer.regels.map((r, i) => regelData(r, i + 1)) },
    },
    select: { id: true, boekstuk: true },
  });
  return { boekingId: gemaakt.id, boekstuk: gemaakt.boekstuk, nieuw: true };
}

function regelData(r: RegelInvoer, volgorde: number) {
  return {
    volgorde,
    rekeningId: r.rekeningId,
    debetCents: r.debetCents ?? 0,
    creditCents: r.creditCents ?? 0,
    isBtwRegel: r.isBtwRegel ?? false,
    ...(r.omschrijving ? { omschrijving: r.omschrijving } : {}),
    ...(r.btwCodeId ? { btwCodeId: r.btwCodeId } : {}),
    ...(r.btwBasisCents !== undefined ? { btwBasisCents: r.btwBasisCents } : {}),
    ...(r.postSleutel ? { postSleutel: r.postSleutel } : {}),
    ...(r.origineleValuta !== undefined ? { origineleValuta: r.origineleValuta } : {}),
    ...(r.origineelCents !== undefined ? { origineelCents: r.origineelCents } : {}),
    ...(r.koersMicro !== undefined ? { koersMicro: r.koersMicro } : {}),
  };
}

function isUniekeBotsing(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/**
 * Boekt een boeking (de enige schrijfroute). Idempotent: bestaat (administratie, bron, bronId) al, dan komt de
 * bestaande boeking terug met `nieuw: false`. Twee gelijktijdige aanroepen geven ook dezelfde boeking.
 */
export async function boek(invoer: BoekInvoer): Promise<BoekResultaat> {
  try {
    return await prisma.$transaction((tx) => boekInTransactie(tx, invoer));
  } catch (e) {
    // Een gelijktijdige aanroep was ons voor (unieke sleutel): de transactie is teruggedraaid, dus ook onze teller.
    if (isUniekeBotsing(e)) {
      const bestaand = await prisma.boekBoeking.findUnique({
        where: {
          administratieId_bron_bronId: {
            administratieId: invoer.administratieId,
            bron: invoer.bron,
            bronId: invoer.bronId.trim(),
          },
        },
        select: { id: true, boekstuk: true },
      });
      if (bestaand) return { boekingId: bestaand.id, boekstuk: bestaand.boekstuk, nieuw: false };
    }
    throw e;
  }
}

export interface KeerOmOpties {
  /** de boekdag van de tegenboeking, "2026-04-10"; standaard vandaag (Amsterdamse dag) */
  datum?: string | undefined;
  aangemaaktDoor?: string | undefined;
  /** voor tests: het huidige moment */
  now?: Date | undefined;
}

/**
 * Corrigeert een boeking met een tegenboeking: dezelfde regels met debet en credit omgewisseld, op dezelfde rekeningen
 * en met dezelfde open-postsleutel (zodat een debiteur weer op nul komt). De oorspronkelijke boeking blijft staan.
 * Een boeking kan maar een keer worden opgeheven; een tweede aanroep geeft de bestaande tegenboeking terug.
 * Wil je daarna de juiste boeking opnieuw maken, doe dat dan met boek() onder een nieuwe bron.
 */
export async function keerOm(boekingId: string, reden: string, opties: KeerOmOpties = {}): Promise<BoekResultaat> {
  const schoneReden = reden.trim();
  if (!schoneReden) throw AppError.validation("Een tegenboeking heeft een reden nodig.");
  if (schoneReden.length > 500) throw AppError.validation("De reden is te lang (hooguit 500 tekens).");
  controleerGeenPersoonsgegevens(schoneReden, "De reden");
  const datum = opties.datum ?? amsterdamDayKey(opties.now ?? new Date());
  if (!isGeldigeBoekdag(datum)) throw AppError.validation("De boekdatum is geen geldige dag (verwacht: JJJJ-MM-DD).");

  const bestaandeTegen = async () =>
    prisma.boekBoeking.findUnique({ where: { keertBoekingId: boekingId }, select: { id: true, boekstuk: true } });

  try {
    return await prisma.$transaction(async (tx) => {
      const oorspronkelijk = await tx.boekBoeking.findUnique({
        where: { id: boekingId },
        select: {
          id: true,
          administratieId: true,
          dagboek: true,
          boekstuk: true,
          keertBoekingId: true,
          regels: {
            orderBy: { volgorde: "asc" },
            select: {
              rekeningId: true,
              debetCents: true,
              creditCents: true,
              omschrijving: true,
              btwCodeId: true,
              btwBasisCents: true,
              isBtwRegel: true,
              postSleutel: true,
              origineleValuta: true,
              origineelCents: true,
              koersMicro: true,
            },
          },
          administratie: { select: { valuta: true } },
        },
      });
      if (!oorspronkelijk) throw AppError.notFound("Deze boeking bestaat niet.");
      if (oorspronkelijk.keertBoekingId) {
        throw AppError.validation(
          "Dit is zelf een tegenboeking. Een tegenboeking keer je niet om: maak de juiste boeking opnieuw.",
        );
      }
      const regels: RegelInvoer[] = oorspronkelijk.regels.map((r) => ({
        rekeningId: r.rekeningId,
        debetCents: r.creditCents,
        creditCents: r.debetCents,
        isBtwRegel: r.isBtwRegel,
        ...(r.omschrijving !== null ? { omschrijving: r.omschrijving } : {}),
        ...(r.btwCodeId !== null ? { btwCodeId: r.btwCodeId } : {}),
        ...(r.btwBasisCents !== null ? { btwBasisCents: r.btwBasisCents } : {}),
        ...(r.postSleutel !== null ? { postSleutel: r.postSleutel } : {}),
        ...(r.origineleValuta !== null ? { origineleValuta: r.origineleValuta } : {}),
        ...(r.origineelCents !== null ? { origineelCents: r.origineelCents } : {}),
        ...(r.koersMicro !== null ? { koersMicro: r.koersMicro } : {}),
      }));
      return boekInTransactie(tx, {
        administratieId: oorspronkelijk.administratieId,
        dagboek: oorspronkelijk.dagboek,
        datum,
        bron: "TEGENBOEKING",
        bronId: `terug:${oorspronkelijk.id}`,
        omschrijving: omschrijvingVoor("TEGENBOEKING", oorspronkelijk.boekstuk),
        valuta: oorspronkelijk.administratie.valuta,
        regels,
        reden: schoneReden,
        keertBoekingId: oorspronkelijk.id,
        ...(opties.aangemaaktDoor !== undefined ? { aangemaaktDoor: opties.aangemaaktDoor } : {}),
      });
    });
  } catch (e) {
    if (isUniekeBotsing(e)) {
      const bestaand = await bestaandeTegen();
      if (bestaand) return { boekingId: bestaand.id, boekstuk: bestaand.boekstuk, nieuw: false };
    }
    throw e;
  }
}
