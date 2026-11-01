// De periodekeuze boven een dashboard (?periode=30) en het verdelen van rijen over dagen of
// maanden. Alle cijfers onder de keuze rekenen met dezelfde periode, zodat ze kloppen met elkaar.
// Dagen tellen in Nederlandse tijd: een betaling om 00:30 hoort bij die dag, niet bij gisteren.

export const PERIOD_OPTIONS = [7, 30, 90, 365] as const;
export type PeriodDays = (typeof PERIOD_OPTIONS)[number];

export interface Period {
  days: PeriodDays;
  from: Date;
  /** Begin van de even lange periode ervoor, voor de vergelijking. */
  prevFrom: Date;
  to: Date;
  bucket: "day" | "month";
  label: string;
  /** "t.o.v. de 30 dagen ervoor" */
  versus: string;
}

const DAY = 86_400_000;
const LABELS: Record<PeriodDays, string> = { 7: "7 dagen", 30: "30 dagen", 90: "90 dagen", 365: "12 maanden" };
const AMSTERDAM = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" });

export const dayKeyNl = (d: Date): string => AMSTERDAM.format(d);

export function resolvePeriod(raw: string | undefined, fallback: PeriodDays = 30, now = new Date()): Period {
  const parsed = Number(raw);
  const days = (PERIOD_OPTIONS as readonly number[]).includes(parsed) ? (parsed as PeriodDays) : fallback;
  return {
    days,
    from: new Date(now.getTime() - days * DAY),
    prevFrom: new Date(now.getTime() - 2 * days * DAY),
    to: now,
    bucket: days > 90 ? "month" : "day",
    label: LABELS[days],
    versus: days > 90 ? "t.o.v. de 12 maanden ervoor" : `t.o.v. de ${days} dagen ervoor`,
  };
}

/** De sleutels van de grafiek, oudste eerst: YYYY-MM-DD per dag of YYYY-MM per maand. */
export function timelineKeys(period: Pick<Period, "days" | "bucket" | "to">): string[] {
  const today = dayKeyNl(period.to);
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  if (period.bucket === "month") {
    return Array.from({ length: 12 }, (_, i) => {
      const at = new Date(Date.UTC(y, m - 1 - (11 - i), 1));
      return at.toISOString().slice(0, 7);
    });
  }
  return Array.from({ length: period.days }, (_, i) => new Date(Date.UTC(y, m - 1, d - (period.days - 1 - i))).toISOString().slice(0, 10));
}

/** Telt de waarde van elke rij op bij zijn dag of maand. Rijen buiten de grafiek vallen weg. */
export function bucketSum<T>(rows: readonly T[], at: (row: T) => Date | null | undefined, value: (row: T) => number, period: Pick<Period, "days" | "bucket" | "to">): number[] {
  const keys = timelineKeys(period);
  const totals = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const row of rows) {
    const date = at(row);
    if (!date) continue;
    const day = dayKeyNl(date);
    const key = period.bucket === "month" ? day.slice(0, 7) : day;
    const current = totals.get(key);
    if (current !== undefined) totals.set(key, current + value(row));
  }
  return keys.map((k) => totals.get(k) ?? 0);
}

export const bucketCount = <T>(rows: readonly T[], at: (row: T) => Date | null | undefined, period: Pick<Period, "days" | "bucket" | "to">): number[] => bucketSum(rows, at, () => 1, period);

/** Verschil in procenten. Null als er niets is om mee te vergelijken: dan zeggen we niets. */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

/** Geeft null als het antwoord te lang duurt of mislukt. Voor cijfers die van buiten komen. */
export function within<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([work.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** Vangt een mislukte query op, zodat één kapot cijfer niet de hele pagina meeneemt. */
export async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}
