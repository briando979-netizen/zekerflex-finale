import { prisma } from "@/lib/prisma";
import type { Principal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getDict } from "@/lib/i18n/server";
import { listCounterOffers } from "@/lib/offers/store";
import { amsterdamDayKey, amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Month calendar of an organisation's klussen (shifts). Days are Dutch
// calendar days: the server runs in UTC, and a shift at 00:30 belongs to the
// Dutch day it starts on.
// ---------------------------------------------------------------------------

export interface CalShift {
  id: string;
  title: string;
  branch: string;
  startsAt: Date;
  endsAt: Date;
  positions: number;
  filled: number;
  status: string;
  /** open reacties op deze klus (naar YoungOnes' "n reacties"-chip in de kalender) */
  reacties: number;
}

export interface CalendarMonth {
  year: number;
  month: number; // 0-11
  label: string; // "September 2026"
  /** Monday-first 6x7 grid of days (some belong to the prev/next month) */
  weeks: { day: number; inMonth: boolean; isToday: boolean; shifts: CalShift[] }[][];
  total: number;
  prev: { y: number; m: number };
  next: { y: number; m: number };
}

/** Days before the 1st in a Monday-first grid (JS: 0 = Sun). */
const leadDays = (year: number, month: number) => (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;

/** The 6x7 grid of one month (0-11), with each shift on its Dutch start day. */
export function monthGrid(year: number, month: number, shifts: CalShift[], now = new Date()): CalendarMonth["weeks"] {
  const lead = leadDays(year, month);
  const todayKey = amsterdamDayKey(now);
  const byDay = new Map<string, CalShift[]>();
  for (const s of shifts) {
    const k = amsterdamDayKey(s.startsAt);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const weeks: CalendarMonth["weeks"] = [];
  for (let w = 0; w < 6; w += 1) {
    const row: CalendarMonth["weeks"][number] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(Date.UTC(year, month, 1 - lead + w * 7 + d));
      const key = date.toISOString().slice(0, 10);
      row.push({ day: date.getUTCDate(), inMonth: date.getUTCMonth() === month, isToday: key === todayKey, shifts: byDay.get(key) ?? [] });
    }
    weeks.push(row);
  }
  return weeks;
}

export interface CalendarWeek {
  /** ISO date string "YYYY-MM-DD" van de maandag */
  mondayKey: string;
  /** 7 dagen van ma t/m zo */
  days: { dayKey: string; dayLabel: string; dayNum: number; isToday: boolean; shifts: CalShift[] }[];
  prev: string; // ISO date maandag van vorige week
  next: string; // ISO date maandag van volgende week
}

/** Maandag van de week waar de gegeven datum in valt (Amsterdam-tijd). */
export function weekMaandag(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // 0 = ma
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
  return mon.toISOString().slice(0, 10);
}

export async function getEmployerCalendarWeek(
  p: Principal,
  mondayKey: string,
): Promise<CalendarWeek> {
  const scope = await resolveEmployerScope(p);
  const branchFilter = scope.branchIds
    ? { id: { in: scope.branchIds } }
    : { tenantId: { in: scope.tenantIds } };

  const mon = new Date(mondayKey + "T00:00:00Z");
  const sun = new Date(Date.UTC(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate() + 7));
  const gridStart = amsterdamToUtc(mon.getUTCFullYear(), mon.getUTCMonth() + 1, mon.getUTCDate());
  const gridEnd = amsterdamToUtc(sun.getUTCFullYear(), sun.getUTCMonth() + 1, sun.getUTCDate());

  const rows = await prisma.shift.findMany({
    where: {
      branch: branchFilter,
      status: { not: "CANCELLED" },
      startsAt: { gte: gridStart, lt: gridEnd },
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      positions: true,
      status: true,
      branch: { select: { name: true } },
      _count: { select: { assignments: { where: { cancelledAt: null } } } },
    },
    orderBy: { startsAt: "asc" },
  });

  const perKlus = new Map<string, number>();
  try {
    const ids = new Set(rows.map((r) => r.id));
    for (const o of await listCounterOffers(500)) if (o.status === "pending" && ids.has(o.shiftId)) perKlus.set(o.shiftId, (perKlus.get(o.shiftId) ?? 0) + 1);
  } catch { /* geen reacties */ }

  const shifts: CalShift[] = rows.map((s) => ({
    id: s.id,
    title: s.title,
    branch: s.branch.name,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    positions: s.positions,
    filled: s._count.assignments,
    status: s.status,
    reacties: perKlus.get(s.id) ?? 0,
  }));

  const byDay = new Map<string, CalShift[]>();
  for (const s of shifts) {
    const k = amsterdamDayKey(s.startsAt);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }

  const todayKey = amsterdamDayKey(new Date());
  const dict = await getDict();
  const SHORT_DAYS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate() + i));
    const key = d.toISOString().slice(0, 10);
    const monthName = dict.calendar.months[d.getUTCMonth()] ?? "";
    return {
      dayKey: key,
      dayLabel: `${SHORT_DAYS[i] ?? ""} ${d.getUTCDate()} ${monthName.slice(0, 3)}`,
      dayNum: d.getUTCDate(),
      isToday: key === todayKey,
      shifts: byDay.get(key) ?? [],
    };
  });

  const prevMon = new Date(Date.UTC(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate() - 7));
  const nextMon = new Date(Date.UTC(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate() + 7));

  return {
    mondayKey,
    days,
    prev: prevMon.toISOString().slice(0, 10),
    next: nextMon.toISOString().slice(0, 10),
  };
}

export async function getEmployerCalendarMonth(
  p: Principal,
  year: number,
  month: number,
): Promise<CalendarMonth> {
  const scope = await resolveEmployerScope(p);
  const branchFilter = scope.branchIds
    ? { id: { in: scope.branchIds } }
    : { tenantId: { in: scope.tenantIds } };

  // midnight in Amsterdam of the first and the day after the last grid day
  const lead = leadDays(year, month);
  const gridStart = amsterdamToUtc(year, month + 1, 1 - lead);
  const gridEnd = amsterdamToUtc(year, month + 1, 1 - lead + 42);

  const rows = await prisma.shift.findMany({
    where: {
      branch: branchFilter,
      status: { not: "CANCELLED" },
      startsAt: { gte: gridStart, lt: gridEnd },
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      positions: true,
      status: true,
      branch: { select: { name: true } },
      _count: { select: { assignments: { where: { cancelledAt: null } } } },
    },
    orderBy: { startsAt: "asc" },
  });

  // open reacties per klus (een storing in de KV laat de kalender gewoon staan, zonder chips)
  const perKlus = new Map<string, number>();
  try {
    const ids = new Set(rows.map((r) => r.id));
    for (const o of await listCounterOffers(500)) if (o.status === "pending" && ids.has(o.shiftId)) perKlus.set(o.shiftId, (perKlus.get(o.shiftId) ?? 0) + 1);
  } catch {
    /* geen reacties te lezen */
  }

  const shifts: CalShift[] = rows.map((s) => ({
    id: s.id,
    title: s.title,
    branch: s.branch.name,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    positions: s.positions,
    filled: s._count.assignments,
    status: s.status,
    reacties: perKlus.get(s.id) ?? 0,
  }));

  const prevD = new Date(Date.UTC(year, month - 1, 1));
  const nextD = new Date(Date.UTC(year, month + 1, 1));

  return {
    year,
    month,
    label: `${(await getDict()).calendar.months[month]} ${year}`,
    weeks: monthGrid(year, month, shifts),
    total: shifts.filter((s) => {
      const p = amsterdamParts(s.startsAt);
      return p.year === year && p.month - 1 === month;
    }).length,
    prev: { y: prevD.getUTCFullYear(), m: prevD.getUTCMonth() },
    next: { y: nextD.getUTCFullYear(), m: nextD.getUTCMonth() },
  };
}
