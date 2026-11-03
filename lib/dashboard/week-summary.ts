import { amsterdamWeek } from "@/lib/shifts/worker-overlap";

// "Deze week: 3 klussen · 24 uur · € 432" bovenaan Mijn klussen. Telt wat je
// deze Nederlandse week (ma 00:00 – ma 00:00) doet of deed: komende, afgelopen
// en goedgekeurde klussen; afgezegde en niet-gekozen niet. Puur, zodat het te testen is.

const COUNTED = new Set(["active", "hours", "done"]);

export interface WeekSummary {
  count: number;
  hours: number;
  grossCents: number;
}

export function weekSummary(
  items: readonly { status: string; shift: { id: string; startsAt: Date; hours: number; grossCents: number } }[],
  now: Date = new Date(),
): WeekSummary {
  const { from, to } = amsterdamWeek(now);
  const seen = new Set<string>();
  let hours = 0;
  let grossCents = 0;
  for (const i of items) {
    const start = new Date(i.shift.startsAt);
    if (!COUNTED.has(i.status) || start < from || start >= to || seen.has(i.shift.id)) continue;
    seen.add(i.shift.id);
    hours += i.shift.hours;
    grossCents += i.shift.grossCents;
  }
  return { count: seen.size, hours: Math.round(hours * 10) / 10, grossCents };
}
