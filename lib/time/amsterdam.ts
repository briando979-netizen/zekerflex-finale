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

/** Calendar date + time of an instant as seen in Amsterdam. */
export function amsterdamParts(d: Date): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const parts = Object.fromEntries(formatterFor("Europe/Amsterdam").formatToParts(d).map((p) => [p.type, p.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return { year, month, day, hour: Number(parts.hour), minute: Number(parts.minute), weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}
