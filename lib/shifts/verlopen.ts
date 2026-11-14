import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Klussen na afloop afronden (de kern: puur, zonder prisma of kv; alles komt via `VerlopenAfhankelijkheden`).
// Geen klus ging na zijn eindtijd vanzelf op COMPLETED: niets in de code zette die status, dus een uitgevoerde
// klus bleef voor altijd OPEN/FILLED (14 nov: 30 echte klussen na afloop nog op OPEN, waarvan 8 gewoon uitgevoerd).
// Elke nacht (deploy/cron/entrypoint.sh) gaat een klus naar COMPLETED als zijn eindtijd ruim voorbij is
// én er nog iemand op staat (een inschrijving zonder cancelledAt). Een klus zonder inschrijving blijft OPEN:
// anders verdwijnt onvervulde vraag uit de bezettingsgraad (lib/admin/insights/home.ts telt "niet CANCELLED").
// Geen mail en geen push: alleen de status gaat om. Uren, facturen en reviews hangen niet van de klusstatus af.
// Standaard uit (vlag "klussen-verlopen-sluiten"): dan telt hij alleen en bewaart hij de stand in KV.
// ---------------------------------------------------------------------------

export const VERLOPEN_VLAG = "klussen-verlopen-sluiten";
export const KLUSSEN_VERLOPEN_JOB = "klussen-verlopen";
/** De laatste stand (droog of echt): alleen aantallen, geen klus- of persoonsgegevens. */
export const KV_VERLOPEN_METING = "meting:klussen-verlopen";
/** Een klus telt pas zo lang na zijn eindtijd als verlopen: uitchecken en uren invullen lopen vaak nog even door. */
export const MARGE_UREN = 2;
/** Statussen waarin een klus na afloop bleef hangen. DRAFT, CANCELLED en COMPLETED blijven altijd onaangeroerd. */
export const NOG_LOPEND = ["OPEN", "MATCHING", "PARTIALLY_FILLED", "FILLED", "IN_PROGRESS"] as const;

export function verlopenGrens(nu: Date): Date {
  return new Date(nu.getTime() - MARGE_UREN * 3_600_000);
}

/** Na afloop, nog niet afgerond, en er staat nog iemand op: die gaat naar COMPLETED. */
export function verlopenWhere(nu: Date): Prisma.ShiftWhereInput {
  return { status: { in: [...NOG_LOPEND] }, endsAt: { lt: verlopenGrens(nu) }, assignments: { some: { cancelledAt: null } } };
}

/** Na afloop zonder iemand erop: blijft OPEN (onvervulde vraag); alleen geteld, voor de stand. */
export function zonderInschrijvingWhere(nu: Date): Prisma.ShiftWhereInput {
  return { status: { in: [...NOG_LOPEND] }, endsAt: { lt: verlopenGrens(nu) }, assignments: { none: { cancelledAt: null } } };
}

export interface VerlopenMeting {
  at: string;
  /** true = de vlag stond uit: alleen geteld, niets veranderd */
  droog: boolean;
  /** klussen na afloop met iemand erop (in de droge stand: zoveel zouden er dicht gaan) */
  gevonden: number;
  /** zoveel gingen er echt naar COMPLETED */
  gesloten: number;
  /** klussen na afloop zonder iemand erop: die blijven bewust OPEN */
  zonderInschrijving: number;
}

export interface VerlopenAfhankelijkheden {
  aan(): Promise<boolean>;
  tel(where: Prisma.ShiftWhereInput): Promise<number>;
  /** zet alles wat aan `where` voldoet op COMPLETED en geeft het aantal terug */
  sluit(where: Prisma.ShiftWhereInput): Promise<number>;
  bewaar(meting: VerlopenMeting): Promise<void>;
}

export async function rondVerlopenAf(d: VerlopenAfhankelijkheden, nu: Date = new Date()): Promise<VerlopenMeting> {
  const aan = await d.aan();
  const where = verlopenWhere(nu);
  const [gevonden, zonderInschrijving] = await Promise.all([d.tel(where), d.tel(zonderInschrijvingWhere(nu))]);
  // sluiten met dezelfde voorwaarde als het tellen: een klus die intussen afgerond of geannuleerd is, valt er vanzelf buiten
  const gesloten = aan && gevonden > 0 ? await d.sluit(where) : 0;
  const meting: VerlopenMeting = { at: nu.toISOString(), droog: !aan, gevonden, gesloten, zonderInschrijving };
  await d.bewaar(meting);
  return meting;
}
