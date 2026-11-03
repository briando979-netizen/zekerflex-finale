import type { PrismaClient, Prisma } from "@prisma/client";
import { amsterdamClock, amsterdamParts } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Dubbel geboekt? Eén werker kan niet op twee plekken tegelijk zijn. De
// automatische matching slaat werkers met een overlappende dienst al over
// (lib/matching/engine.ts); deze controle geldt voor elk ander pad dat iemand
// inplant: zelf aannemen, een aanbod accepteren, een tegenbod dat de werkgever
// goedkeurt en een vervanging. Een geannuleerde dienst telt niet mee.
// ---------------------------------------------------------------------------

type Db = Pick<PrismaClient, "shiftAssignment"> | Pick<Prisma.TransactionClient, "shiftAssignment">;

export interface OverlappingShift {
  shiftId: string;
  title: string;
  branch: string;
  startsAt: Date;
  endsAt: Date;
}

/** De eerste niet-geannuleerde dienst van deze werker die met het venster overlapt (aansluitend telt niet). */
export async function findOverlappingShift(
  db: Db,
  freelancerId: string,
  window: { shiftId: string; startsAt: Date; endsAt: Date },
): Promise<OverlappingShift | null> {
  const row = await db.shiftAssignment.findFirst({
    where: {
      freelancerId,
      cancelledAt: null,
      shiftId: { not: window.shiftId },
      shift: { startsAt: { lt: window.endsAt }, endsAt: { gt: window.startsAt } },
    },
    orderBy: { shift: { startsAt: "asc" } },
    select: {
      shift: { select: { id: true, title: true, startsAt: true, endsAt: true, branch: { select: { name: true } } } },
    },
  });
  if (!row) return null;
  const s = row.shift;
  return { shiftId: s.id, title: s.title, branch: s.branch.name, startsAt: s.startsAt, endsAt: s.endsAt };
}

/** Pure variant voor lijsten: overlapt dit venster met een van de eigen diensten? (aansluitend telt niet) */
export function overlapsAny(
  windows: readonly { startsAt: Date; endsAt: Date }[],
  w: { startsAt: Date; endsAt: Date },
): boolean {
  const a = w.startsAt.getTime();
  const b = w.endsAt.getTime();
  return windows.some((o) => o.startsAt.getTime() < b && o.endsAt.getTime() > a);
}

/** De Arbeidstijdenwet vraagt minstens 11 uur rust tussen twee diensten. */
export const MIN_REST_HOURS = 11;

/**
 * De eigen dienst met de kortste rust ervoor of erna, als die rust korter is
 * dan MIN_REST_HOURS. Overlap telt hier niet mee: die wordt al geweigerd.
 */
export function shortestRest<T extends { startsAt: Date; endsAt: Date }>(
  windows: readonly T[],
  w: { startsAt: Date; endsAt: Date },
): { other: T; restMs: number } | null {
  const a = w.startsAt.getTime();
  const b = w.endsAt.getTime();
  let best: { other: T; restMs: number } | null = null;
  for (const o of windows) {
    const gap = o.endsAt.getTime() <= a ? a - o.endsAt.getTime() : o.startsAt.getTime() >= b ? o.startsAt.getTime() - b : null;
    if (gap === null || gap >= MIN_REST_HOURS * 3_600_000) continue;
    if (!best || gap < best.restMs) best = { other: o, restMs: gap };
  }
  return best;
}

const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MON = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** "di 4 nov 09:00–17:00", in Nederlandse tijd (de server draait in UTC). */
export function overlapWhen(o: Pick<OverlappingShift, "startsAt" | "endsAt">): string {
  const p = amsterdamParts(o.startsAt);
  return `${WD[p.weekday] ?? ""} ${p.day} ${MON[p.month - 1] ?? ""} ${amsterdamClock(o.startsAt)}–${amsterdamClock(o.endsAt)}`;
}

/** Foutmelding voor de werker zelf. */
export function overlapMessageSelf(o: OverlappingShift): string {
  return `Je staat dan al ingepland: ${o.title} bij ${o.branch} (${overlapWhen(o)}). Twee diensten tegelijk kan niet. Zeg die eerst af als je deze wilt doen.`;
}

/** Foutmelding voor de werkgever of het team dat iemand inplant. */
export function overlapMessageOther(o: OverlappingShift): string {
  return `Deze flexwerker staat op dat moment al ingepland bij een andere dienst (${overlapWhen(o)}). Twee diensten tegelijk kan niet.`;
}
