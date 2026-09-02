// ISO-8601 week helpers (Monday-based, week 1 = the week containing the first
// Thursday). Pure, timezone-naive on UTC — good enough for weekly payroll cutoffs.

export interface IsoWeek {
  year: number;
  week: number;
}

/** "2026-W35" */
export function isoWeekId(w: IsoWeek): string {
  return `${w.year}-W${String(w.week).padStart(2, "0")}`;
}

export function parseIsoWeekId(id: string): IsoWeek | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(id.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  return { year, week };
}

export function isoWeekOf(date: Date): IsoWeek {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday in current week decides the year.
  const dayNr = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { year: d.getUTCFullYear(), week };
}

/** [start, end) — Monday 00:00:00 UTC to the following Monday. */
export function isoWeekRange(w: IsoWeek): { start: Date; end: Date } {
  const firstThursday = new Date(Date.UTC(w.year, 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  const week1Monday = new Date(firstThursday);
  week1Monday.setUTCDate(firstThursday.getUTCDate() - firstDayNr);
  const start = new Date(week1Monday);
  start.setUTCDate(week1Monday.getUTCDate() + (w.week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
}

/** The most recently completed ISO week (last week relative to now). */
export function lastCompletedIsoWeek(now = new Date()): IsoWeek {
  const d = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  return isoWeekOf(d);
}

export function isoWeekLabel(w: IsoWeek): string {
  const { start, end } = isoWeekRange(w);
  const fmt = (x: Date) =>
    `${String(x.getUTCDate()).padStart(2, "0")}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
  const last = new Date(end.getTime() - 24 * 3600 * 1000);
  return `week ${w.week} · ${fmt(start)} t/m ${fmt(last)} ${w.year}`;
}
