// Wall-clock times ↔ real instants, DST-aware, via Intl (no tz database bundled).

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function offsetMs(timeZone: string, instant: number): number {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** True when the runtime knows this IANA zone name. */
export function isKnownTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function zonedToUtc(timeZone: string, year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = guess - offsetMs(timeZone, guess);
  // re-check once: the offset can differ on the other side of a DST switch
  return new Date(guess - offsetMs(timeZone, first));
}

export function amsterdamToUtc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  return zonedToUtc("Europe/Amsterdam", year, month, day, hour, minute, second);
}

/**
 * "2026-11-05T09:00" (a datetime-local value, no zone) is a Dutch wall-clock
 * time; `new Date()` would read it as UTC on the server. Strings that carry a
 * zone ("…Z", "…+01:00") are read as they are.
 */
export function parseAmsterdamLocal(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  return m
    ? amsterdamToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0))
    : new Date(s);
}

/** 00:00 Amsterdam time of the day `d` falls on, shifted by `addDays` (DST-safe: days can be 23 or 25 h). */
export function amsterdamStartOfDay(d: Date, addDays = 0): Date {
  const p = amsterdamParts(d);
  const n = new Date(Date.UTC(p.year, p.month - 1, p.day + addDays));
  return amsterdamToUtc(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate());
}

/** 00:00 Amsterdam time on the 1st of the month `d` falls in, shifted by `addMonths`. */
export function amsterdamStartOfMonth(d: Date, addMonths = 0): Date {
  const p = amsterdamParts(d);
  const n = new Date(Date.UTC(p.year, p.month - 1 + addMonths, 1));
  return amsterdamToUtc(n.getUTCFullYear(), n.getUTCMonth() + 1, 1);
}

/** Calendar date + time of an instant as seen in Amsterdam. */
export function amsterdamParts(d: Date): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const parts = Object.fromEntries(formatterFor("Europe/Amsterdam").formatToParts(d).map((p) => [p.type, p.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return { year, month, day, hour: Number(parts.hour), minute: Number(parts.minute), weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

// Display helpers. Shift times are Dutch wall-clock times: the server runs in
// UTC and a phone may sit in another zone, so local getters (getHours, getDay…)
// show the wrong hour and make server and browser render different text.
const pad2 = (n: number) => String(n).padStart(2, "0");

/** "09:05" — the Amsterdam time of an instant, the same on server and phone. */
export function amsterdamClock(d: Date | string | number): string {
  const p = amsterdamParts(new Date(d));
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "2026-11-03" — the Amsterdam calendar day of an instant (grouping, day filters). */
export function amsterdamDayKey(d: Date | string | number): string {
  const p = amsterdamParts(new Date(d));
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}
