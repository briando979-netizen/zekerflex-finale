import { prisma } from "@/lib/prisma";
import { forecastDemand } from "@/lib/forecast/demand";
import { dayKeyNl } from "@/lib/admin/period";

// De cijfers achter Admin → Vooruitblik: de statistische verwachting uit lib/forecast/demand,
// plus wat er voor die dagen al echt in de planning staat en hoe de weken ervoor liepen.

const DAY = 86_400_000;
const WEEKS = 8;
const WEEKDAYS = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];

/** Maandag van de week waarin deze datum valt, als YYYY-MM-DD in Nederlandse tijd. */
function weekStartKey(d: Date): string {
  const [y, m, day] = dayKeyNl(d).split("-").map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, day));
  at.setUTCDate(at.getUTCDate() - ((at.getUTCDay() + 6) % 7));
  return at.toISOString().slice(0, 10);
}

const weekdayIndex = (d: Date): number => {
  const [y, m, day] = dayKeyNl(d).split("-").map(Number) as [number, number, number];
  return (new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 6) % 7;
};

export async function forecastInsights(now = new Date()) {
  const since = new Date(now.getTime() - WEEKS * 7 * DAY);
  const until = new Date(now.getTime() + 8 * DAY);
  const shifts = await prisma.shift.findMany({
    where: { startsAt: { gte: since, lte: until }, status: { not: "DRAFT" } },
    select: { startsAt: true, positions: true, assignments: { where: { cancelledAt: null }, select: { id: true } } },
    take: 5000,
  });
  const history = shifts.filter((s) => s.startsAt <= now);
  const upcoming = shifts.filter((s) => s.startsAt > now);
  const forecast = forecastDemand(history, { from: now, windowWeeks: WEEKS });

  const plannedByDay = new Map<string, { positions: number; filled: number }>();
  for (const s of upcoming) {
    const key = dayKeyNl(s.startsAt);
    const cur = plannedByDay.get(key) ?? { positions: 0, filled: 0 };
    plannedByDay.set(key, { positions: cur.positions + Math.max(0, s.positions), filled: cur.filled + s.assignments.length });
  }
  const days = forecast.days.map((d) => ({ ...d, planned: plannedByDay.get(d.date)?.positions ?? 0, filled: plannedByDay.get(d.date)?.filled ?? 0 }));

  const weekKeys = Array.from({ length: WEEKS }, (_, i) => weekStartKey(new Date(now.getTime() - (WEEKS - 1 - i) * 7 * DAY)));
  const byWeek = new Map(weekKeys.map((k) => [k, 0]));
  const byWeekday = WEEKDAYS.map(() => 0);
  for (const s of history) {
    const key = weekStartKey(s.startsAt);
    const positions = Math.max(0, s.positions);
    if (byWeek.has(key)) byWeek.set(key, (byWeek.get(key) ?? 0) + positions);
    byWeekday[weekdayIndex(s.startsAt)]! += positions;
  }

  return {
    forecast,
    days,
    expected: Math.round(days.reduce((sum, d) => sum + d.expectedPositions, 0) * 10) / 10,
    planned: days.reduce((sum, d) => sum + d.planned, 0),
    filled: days.reduce((sum, d) => sum + d.filled, 0),
    weekLabels: weekKeys,
    weekValues: weekKeys.map((k) => byWeek.get(k) ?? 0),
    weekdays: WEEKDAYS.map((label, i) => ({ label, value: byWeekday[i] ?? 0 })),
  };
}
