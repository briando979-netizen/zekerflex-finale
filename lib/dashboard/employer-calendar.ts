import { prisma } from "@/lib/prisma";
import type { Principal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getDict } from "@/lib/i18n/server";

// ---------------------------------------------------------------------------
// Month calendar of an organisation's klussen (shifts).
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
  /** Monday-first 6x7 grid of dates (some belong to the prev/next month) */
  weeks: { date: Date; inMonth: boolean; isToday: boolean; shifts: CalShift[] }[][];
  total: number;
  prev: { y: number; m: number };
  next: { y: number; m: number };
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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

  const gridStart = new Date(year, month, 1);
  // Monday-first offset (JS: 0 = Sun)
  const dow = (gridStart.getDay() + 6) % 7;
  gridStart.setDate(gridStart.getDate() - dow);
  gridStart.setHours(0, 0, 0, 0);
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridEnd.getDate() + 42);

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

  const today = new Date();
  const weeks: CalendarMonth["weeks"] = [];
  for (let w = 0; w < 6; w += 1) {
    const row: CalendarMonth["weeks"][number] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + w * 7 + d);
      row.push({
        date,
        inMonth: date.getMonth() === month,
        isToday: sameDay(date, today),
        shifts: shifts.filter((s) => sameDay(s.startsAt, date)),
      });
    }
    weeks.push(row);
  }

  const prevD = new Date(year, month - 1, 1);
  const nextD = new Date(year, month + 1, 1);

  return {
    year,
    month,
    label: `${(await getDict()).calendar.months[month]} ${year}`,
    weeks,
    total: shifts.filter((s) => s.startsAt.getMonth() === month && s.startsAt.getFullYear() === year).length,
    prev: { y: prevD.getFullYear(), m: prevD.getMonth() },
    next: { y: nextD.getFullYear(), m: nextD.getMonth() },
  };
}
