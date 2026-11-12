import type { PrismaClient, Prisma } from "@prisma/client";
import { amsterdamClock, amsterdamParts, amsterdamStartOfDay } from "@/lib/time/amsterdam";

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

/** Paren diensten van dezelfde werker die overlappen (dubbel ingepland, van vóór deze controle). */
export function doubleBookedPairs<T extends { freelancerId: string; shiftId: string; startsAt: Date; endsAt: Date }>(
  rows: readonly T[],
): [T, T][] {
  const byWorker = new Map<string, T[]>();
  for (const r of rows) byWorker.set(r.freelancerId, [...(byWorker.get(r.freelancerId) ?? []), r]);
  const pairs: [T, T][] = [];
  for (const list of byWorker.values()) {
    const sorted = [...list].sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
    sorted.forEach((a, i) => {
      for (const b of sorted.slice(i + 1)) {
        if (b.startsAt.getTime() >= a.endsAt.getTime()) break; // gesorteerd: de rest begint nog later
        if (b.shiftId !== a.shiftId) pairs.push([a, b]);
      }
    });
  }
  return pairs;
}

/** De Arbeidstijdenwet vraagt in elke 24 uur minstens 11 uur aaneengesloten rust. */
export const MIN_REST_HOURS = 11;
const HOUR_MS = 3_600_000;

/**
 * Past deze klus samen met je eigen diensten binnen de rustregel? Diensten met
 * minder dan 11 uur ertussen horen bij één werkperiode (zoals een gebroken
 * dienst: lunch en diner). Duurt die periode van begin tot eind langer dan
 * 24 − 11 = 13 uur, dan blijft er binnen 24 uur geen 11 uur rust over. Geeft
 * dan de hele periode terug, anders null. Een lange klus zonder andere eigen
 * dienst erbij telt hier niet: dat is geen kwestie van je planning.
 */
export function restViolation(
  windows: readonly { startsAt: Date; endsAt: Date }[],
  w: { startsAt: Date; endsAt: Date },
): { startsAt: Date; endsAt: Date } | null {
  const rest = MIN_REST_HOURS * HOUR_MS;
  let from = w.startsAt.getTime();
  let to = w.endsAt.getTime();
  const left = [...windows];
  let joined = 0;
  for (let grew = true; grew; ) {
    grew = false;
    for (let i = left.length - 1; i >= 0; i--) {
      const o = left[i];
      if (!o || o.startsAt.getTime() >= to + rest || o.endsAt.getTime() <= from - rest) continue;
      from = Math.min(from, o.startsAt.getTime());
      to = Math.max(to, o.endsAt.getTime());
      left.splice(i, 1);
      joined += 1;
      grew = true;
    }
  }
  if (joined === 0 || to - from <= (24 - MIN_REST_HOURS) * HOUR_MS) return null;
  return { startsAt: new Date(from), endsAt: new Date(to) };
}

/** De Arbeidstijdenwet staat werknemers maximaal 60 uur per week toe. */
export const MAX_WEEK_HOURS = 60;

/** Maandag 00:00 en de maandag erna, in Nederlandse tijd, van de week waarin `d` valt. */
export function amsterdamWeek(d: Date): { from: Date; to: Date } {
  const back = (amsterdamParts(d).weekday + 6) % 7; // ma = 0 … zo = 6
  return { from: amsterdamStartOfDay(d, -back), to: amsterdamStartOfDay(d, 7 - back) };
}

/** Uren werk (zonder pauze) in de week van deze klus, de klus zelf meegerekend. */
export function weekHoursWith(
  windows: readonly { startsAt: Date; endsAt: Date; breakMinutes: number }[],
  w: { startsAt: Date; endsAt: Date; breakMinutes: number },
): number {
  const { from, to } = amsterdamWeek(w.startsAt);
  const hours = (o: { startsAt: Date; endsAt: Date; breakMinutes: number }) =>
    Math.max(0, (o.endsAt.getTime() - o.startsAt.getTime()) / HOUR_MS - o.breakMinutes / 60);
  const inWeek = windows.filter((o) => o.startsAt >= from && o.startsAt < to);
  return Math.round((hours(w) + inWeek.reduce((sum, o) => sum + hours(o), 0)) * 10) / 10;
}

const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MON = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** "di 4 nov 09:00–17:00", in Nederlandse tijd (de server draait in UTC). */
export function overlapWhen(o: Pick<OverlappingShift, "startsAt" | "endsAt">): string {
  const p = amsterdamParts(o.startsAt);
  return `${WD[p.weekday] ?? ""} ${p.day} ${MON[p.month - 1] ?? ""} ${amsterdamClock(o.startsAt)}–${amsterdamClock(o.endsAt)}`;
}

/** De plaatshouders van overlapMessageSelf voor de vertaalde melding (lib/i18n/fouten.ts, "apply.overlap"). */
export function overlapParams(o: OverlappingShift): { titel: string; filiaal: string; wanneer: string } {
  return { titel: o.title, filiaal: o.branch, wanneer: overlapWhen(o) };
}

/** Foutmelding voor de werker zelf. */
export function overlapMessageSelf(o: OverlappingShift): string {
  return `Je staat dan al ingepland: ${o.title} bij ${o.branch} (${overlapWhen(o)}). Twee diensten tegelijk kan niet. Zeg die eerst af als je deze wilt doen.`;
}

/** Foutmelding voor de werkgever of het team dat iemand inplant. */
export function overlapMessageOther(o: OverlappingShift): string {
  return `Deze flexwerker staat op dat moment al ingepland bij een andere dienst (${overlapWhen(o)}). Twee diensten tegelijk kan niet.`;
}
