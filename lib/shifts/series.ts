// Group open shifts into multi-day "series": same job, same location, same
// time-of-day, on different calendar days within a two-week window. Pure — no DB.

export interface SeriesShiftLite {
  id: string;
  title: string;
  branchId: string;
  startsAt: Date;
  positions: number;
  taken: number;
}

export interface SeriesDay {
  shiftId: string;
  date: string; // ISO date (yyyy-mm-dd)
  weekday: string;
  seatsFree: number;
}

export interface Series {
  key: string;
  total: number;
  days: SeriesDay[];
}

const WEEKDAY = ["zo", "ma", "di", "wo", "do", "vr", "za"];

function seriesKey(s: SeriesShiftLite): string {
  const hh = s.startsAt.getHours();
  return `${s.title.trim().toLowerCase()}|${s.branchId}|${hh}`;
}

/**
 * Returns a map: shiftId -> Series (only for shifts that belong to a series of
 * 2+ days). One-off shifts are absent from the map.
 */
export function detectSeries(shifts: SeriesShiftLite[]): Map<string, Series> {
  const groups = new Map<string, SeriesShiftLite[]>();
  for (const s of shifts) {
    const k = seriesKey(s);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
  }

  const out = new Map<string, Series>();
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    const sorted = [...members].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const span = sorted[sorted.length - 1]!.startsAt.getTime() - sorted[0]!.startsAt.getTime();
    if (span > 21 * 24 * 3600 * 1000) continue; // not a coherent run

    const days: SeriesDay[] = sorted.map((s) => ({
      shiftId: s.id,
      date: s.startsAt.toISOString().slice(0, 10),
      weekday: WEEKDAY[s.startsAt.getDay()] ?? "",
      seatsFree: Math.max(0, s.positions - s.taken),
    }));
    const series: Series = { key, total: members.length, days };
    for (const s of members) out.set(s.id, series);
  }
  return out;
}
