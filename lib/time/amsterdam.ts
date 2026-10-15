// Wall-clock time in Europe/Amsterdam → the real instant (UTC), DST-aware.
const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Amsterdam",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function offsetMs(instant: number): number {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function amsterdamToUtc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = guess - offsetMs(guess);
  // re-check once: the offset can differ on the other side of a DST switch
  return new Date(guess - offsetMs(first));
}

/** Calendar date + time of an instant as seen in Amsterdam. */
export function amsterdamParts(d: Date): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return { year, month, day, hour: Number(parts.hour), minute: Number(parts.minute), weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}
