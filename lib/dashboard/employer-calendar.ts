import { prisma } from "@/lib/prisma";
import type { Principal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getDict } from "@/lib/i18n/server";
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

  const shifts: CalShift[] = rows.map((s) => ({
    id: s.id,
    title: s.title,
    branch: s.branch.name,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    positions: s.positions,
    filled: s._count.assignments,
    status: s.status,
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
