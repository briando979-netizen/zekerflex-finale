// ---------------------------------------------------------------------------
// Beheer → Boekhouding: de gegevens voor het scherm (alleen lezen, alleen voor de platformbeheerder). Het overzicht
// (administraties, wat er nagekeken moet worden, wat klanten nog schuldig zijn, wat je nog moet doen) en de lijst bonnen
// bij "even kijken". Gebruikt de bestaande functies; lezen.ts blijft zoals het is. Nooit de OCR-tekst teruggeven en
// nooit leveranciersnamen loggen.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { lijstAdministraties } from "./beheer";
import { vindDubbel, type BonSleutel } from "./bonnen/beslis";
import { leesBonKop } from "./bonnen/bonkop";
import { leesBonBestand } from "./bonnen/opslag";
import { BON_REKENINGEN } from "./bonnen/velden";
import { deadlineLijst } from "./deadlines";
import { openPosten } from "./lezen";
import {
  dagenTot,
  tijdstipDagTekst,
  type BonRij,
  type CategorieKeuze,
  type DeadlineRij,
  type OverzichtGegevens,
} from "./scherm-kern";

/** De kostenrekeningen waaruit een mens kiest bij het goedkeuren. */
export function categorieKeuzes(): CategorieKeuze[] {
  return Object.entries(BON_REKENINGEN)
    .map(([nummer, naam]) => ({ nummer, naam }))
    .sort((a, b) => a.nummer.localeCompare(b.nummer));
}

export function deadlineRijen(nu: Date): DeadlineRij[] {
  return deadlineLijst(nu).map((d) => ({
    sleutel: d.sleutel,
    titel: d.titel,
    datumTekst: tijdstipDagTekst(d.datum),
    dagenTot: dagenTot(d.datum, nu),
    wat: d.wat,
    waarschuwing: d.waarschuwing ?? null,
    bevestigDoor: d.bevestigDoor,
  }));
}

export async function overzichtGegevens(nu: Date = new Date()): Promise<OverzichtGegevens> {
  const lijst = await lijstAdministraties();
  const peildatum = amsterdamDayKey(nu);
  const administraties = [];
  for (const a of lijst) {
    const [evenKijken, posten] = await Promise.all([
      prisma.boekBon.count({ where: { administratieId: a.id, status: "EVEN_KIJKEN" } }),
      openPosten(a.id, peildatum),
    ]);
    const debiteuren = posten.filter((p) => p.soort === "DEBITEUR");
    administraties.push({
      id: a.id,
      soort: a.soort,
      naam: a.naam,
      valuta: a.valuta,
      actief: a.actief,
      boekingen: a.boekingen,
      vergrendeldeMaanden: a.vergrendeldeMaanden,
      bonnenEvenKijken: evenKijken,
      openstaandCents: debiteuren.reduce((som, p) => som + p.saldoCents, 0),
      openstaandPosten: debiteuren.length,
    });
  }
  return { administraties, deadlines: deadlineRijen(nu) };
}

const MAX_BONNEN = 100;

const BON_SELECT = {
  id: true,
  administratieId: true,
  status: true,
  mimeType: true,
  bestandSha256: true,
  leverancier: true,
  bonDatum: true,
  totaalCents: true,
  btwCents: true,
  valuta: true,
  voorstelRekeningId: true,
  zekerheidPromille: true,
  evenKijkenReden: true,
  createdAt: true,
  btwCode: { select: { tariefBasispunten: true } },
} as const;

type BonRecord = {
  id: string;
  administratieId: string;
  status: BonRij["status"];
  mimeType: string;
  bestandSha256: string;
  leverancier: string | null;
  bonDatum: Date | null;
  totaalCents: number | null;
  btwCents: number | null;
  valuta: string | null;
  voorstelRekeningId: string | null;
  zekerheidPromille: number | null;
  evenKijkenReden: string | null;
  createdAt: Date;
  btwCode: { tariefBasispunten: number } | null;
};

/** Het id van een andere bon (niet afgewezen) met dezelfde leverancier, datum en bedrag, of null. */
async function dubbelVan(b: BonRecord): Promise<string | null> {
  if (b.leverancier === null || b.bonDatum === null || b.totaalCents === null) return null;
  const rijen = await prisma.boekBon.findMany({
    where: { administratieId: b.administratieId, id: { not: b.id }, status: { not: "AFGEWEZEN" }, bonDatum: b.bonDatum, totaalCents: b.totaalCents },
    select: { id: true, bestandSha256: true, leverancier: true, bonDatum: true, totaalCents: true },
    take: 50,
  });
  const bestaande: BonSleutel[] = rijen.map((r) => ({
    id: r.id,
    sha256: r.bestandSha256,
    leverancier: r.leverancier,
    bonDatum: r.bonDatum ? r.bonDatum.toISOString().slice(0, 10) : null,
    totaalCents: r.totaalCents,
  }));
  const dag = b.bonDatum.toISOString().slice(0, 10);
  // de sha van de bon zelf telt hier niet mee: dezelfde bytes zijn dezelfde bon (uniek per administratie)
  return vindDubbel({ sha256: `eigen:${b.id}`, leverancier: b.leverancier, bonDatum: dag, totaalCents: b.totaalCents }, bestaande)?.id ?? null;
}

/** Zet één bonrecord om naar de rij voor het scherm (ook voor de teruggegeven serverversie na een actie). */
export async function bonRijVoor(b: BonRecord): Promise<BonRij> {
  const [rekening, kop, dubbel] = await Promise.all([
    b.voorstelRekeningId
      ? prisma.boekRekening.findUnique({ where: { id: b.voorstelRekeningId }, select: { nummer: true } })
      : Promise.resolve(null),
    leesBonKop(b.id).catch(() => null),
    dubbelVan(b),
  ]);
  return {
    id: b.id,
    administratieId: b.administratieId,
    status: b.status,
    afzender: kop?.afzender ?? null,
    leverancier: b.leverancier,
    bonDatum: b.bonDatum ? b.bonDatum.toISOString().slice(0, 10) : null,
    totaalCents: b.totaalCents,
    btwCents: b.btwCents,
    valuta: b.valuta,
    btwPercentage: b.btwCode ? b.btwCode.tariefBasispunten / 100 : null,
    rekeningNummer: rekening?.nummer ?? null,
    zekerheidPromille: b.zekerheidPromille,
    evenKijkenReden: b.evenKijkenReden,
    dubbelVan: dubbel,
    mimeType: b.mimeType,
    ontvangen: tijdstipDagTekst(b.createdAt),
  };
}

/** De bonnen die een mens moet nakijken, oudste eerst. */
export async function lijstBonnenEvenKijken(administratieId?: string): Promise<BonRij[]> {
  const rijen = await prisma.boekBon.findMany({
    where: { status: "EVEN_KIJKEN", ...(administratieId ? { administratieId } : {}) },
    orderBy: { createdAt: "asc" },
    take: MAX_BONNEN,
    select: BON_SELECT,
  });
  return Promise.all(rijen.map((r) => bonRijVoor(r)));
}

export async function bonRijOpId(id: string): Promise<BonRij> {
  const b = await prisma.boekBon.findUnique({ where: { id }, select: BON_SELECT });
  if (!b) throw AppError.notFound("Deze bon bestaat niet.");
  return bonRijVoor(b);
}

/** Het bestand van een bon, uit storage/. */
export async function bonBestandVoor(id: string): Promise<{ bytes: Buffer; mimeType: string; extensie: string }> {
  const b = await prisma.boekBon.findUnique({ where: { id }, select: { bestandPad: true, mimeType: true } });
  if (!b) throw AppError.notFound("Deze bon bestaat niet.");
  const bytes = await leesBonBestand(b.bestandPad).catch(() => {
    throw AppError.notFound("Het bestand van deze bon is niet meer te vinden op de opslag.");
  });
  const extensie = /\.([a-z0-9]{2,4})$/.exec(b.bestandPad)?.[1] ?? "bin";
  return { bytes, mimeType: b.mimeType, extensie };
}
