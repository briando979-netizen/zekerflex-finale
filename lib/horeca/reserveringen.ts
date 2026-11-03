import type { HorecaReserveringStatus, HorecaZaak, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { amsterdamDayKey, amsterdamParts } from "@/lib/time/amsterdam";
import { beschikbaarheid, capaciteit, isDatum, leesInstellingen, magAnnuleren, reserveerFout, type ReserveerInstellingen } from "@/lib/horeca/reserveren";

// ---------------------------------------------------------------------------
// Reserveringen van een zaak. Een online reservering wordt onder een slot per
// zaak en dag nog één keer tegen de capaciteit gehouden, zodat twee gasten
// niet tegelijk de laatste plaatsen krijgen. De bediening mag zelf inboeken,
// ook boven de online grenzen (telefoon, vaste gast).
// ---------------------------------------------------------------------------

const TELT_MEE: HorecaReserveringStatus[] = ["BEVESTIGD", "AANGEKOMEN"];

/** De Nederlandse datum en tijd van nu (de server draait in UTC). */
export function nuNL(): { datum: string; minuten: number } {
  const d = new Date();
  const p = amsterdamParts(d);
  return { datum: amsterdamDayKey(d), minuten: p.hour * 60 + p.minute };
}

async function capaciteitVan(db: Prisma.TransactionClient, zaak: HorecaZaak): Promise<{ inst: ReserveerInstellingen; cap: number }> {
  const inst = leesInstellingen(zaak.reserveren);
  const s = await db.horecaTafel.aggregate({ where: { zaakId: zaak.id, actief: true }, _sum: { plaatsen: true } });
  return { inst, cap: capaciteit(inst, s._sum.plaatsen ?? 0) };
}

const bezetOp = (db: Prisma.TransactionClient, zaakId: string, datum: string) =>
  db.horecaReservering.findMany({ where: { zaakId, datum, status: { in: TELT_MEE } }, select: { tijd: true, personen: true } });

/** Welke tijden op een dag vrij zijn voor zoveel personen (voor de site). */
export async function vrijeTijden(zaak: HorecaZaak, datum: string, personen: number) {
  const { inst, cap } = await capaciteitVan(prisma, zaak);
  return { instellingen: inst, tijden: beschikbaarheid(datum, personen, zaak.openingstijden, inst, cap, await bezetOp(prisma, zaak.id, datum), nuNL()) };
}

export interface NieuweReservering {
  datum: string;
  tijd: string;
  personen: number;
  naam: string;
  email: string;
  telefoon: string;
  opmerking: string;
}

export async function maakReservering(zaak: HorecaZaak, r: NieuweReservering, bron: "online" | "bediening") {
  if (!isDatum(r.datum) || !/^\d{2}:\d{2}$/.test(r.tijd)) throw AppError.validation("Kies een datum en tijd.");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`horeca-reservering:${zaak.id}:${r.datum}`}))`;
    if (bron === "online") {
      const { inst, cap } = await capaciteitVan(tx, zaak);
      const fout = reserveerFout(r, zaak.openingstijden, inst, cap, await bezetOp(tx, zaak.id, r.datum), nuNL());
      if (fout) throw AppError.validation(fout);
    }
    return tx.horecaReservering.create({
      data: { zaakId: zaak.id, ...r, email: r.email.trim().toLowerCase(), naam: r.naam.trim(), telefoon: r.telefoon.trim(), opmerking: r.opmerking.trim(), bron },
    });
  });
}

/** De reserveringen van één dag (beheer), op tijd. */
export async function reserveringenOp(zaakId: string, datum: string) {
  const lijst = await prisma.horecaReservering.findMany({ where: { zaakId, datum }, orderBy: [{ tijd: "asc" }, { createdAt: "asc" }], include: { tafel: { select: { naam: true } } } });
  return lijst.map(({ tafel, ...r }) => ({ ...r, tafelNaam: tafel?.naam ?? null }));
}

export async function zetReserveringStatus(zaak: HorecaZaak, id: string, status: HorecaReserveringStatus) {
  const r = await prisma.horecaReservering.updateMany({ where: { id, zaakId: zaak.id }, data: { status } });
  if (!r.count) throw AppError.notFound("Reservering niet gevonden.");
}

export async function zetReserveringTafel(zaak: HorecaZaak, id: string, tafelId: string | null) {
  if (tafelId && !(await prisma.horecaTafel.findFirst({ where: { id: tafelId, zaakId: zaak.id }, select: { id: true } }))) throw AppError.validation("Kies een bestaande tafel.");
  const r = await prisma.horecaReservering.updateMany({ where: { id, zaakId: zaak.id }, data: { tafelId } });
  if (!r.count) throw AppError.notFound("Reservering niet gevonden.");
}

/** De reservering achter een annuleerlink (of null), om de gast te laten zien wat hij annuleert. */
export const reserveringVoorGast = (zaakId: string, id: string) =>
  prisma.horecaReservering.findFirst({ where: { id, zaakId }, select: { id: true, datum: true, tijd: true, personen: true, naam: true, email: true, telefoon: true, opmerking: true, status: true } });

/** De gast annuleert zelf (via de ondertekende link). */
export async function annuleerDoorGast(zaak: HorecaZaak, id: string) {
  const r = await reserveringVoorGast(zaak.id, id);
  if (!r) throw AppError.notFound("Deze reservering bestaat niet (meer).");
  if (r.status === "GEANNULEERD") throw AppError.conflict("Deze reservering is al geannuleerd.");
  if (!magAnnuleren(r, nuNL())) throw AppError.precondition("Deze reservering kun je niet meer online annuleren. Bel ons even.");
  await prisma.horecaReservering.update({ where: { id: r.id }, data: { status: "GEANNULEERD" } });
  return r;
}

export const bewaarReserveerInstellingen = (zaak: HorecaZaak, inst: ReserveerInstellingen) =>
  prisma.horecaZaak.update({ where: { id: zaak.id }, data: { reserveren: { ...inst } } });
