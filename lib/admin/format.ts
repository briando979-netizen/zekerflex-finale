// Getallen en datums in de beheeromgeving: overal dezelfde schrijfwijze. Geen server-
// of browserafhankelijkheden, dus bruikbaar aan beide kanten.

const EURO_FULL = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const EURO_ROUND = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const COUNT = new Intl.NumberFormat("nl-NL");
const TZ = "Europe/Amsterdam";

/** € 162,88 onder de duizend euro, daarboven zonder centen: € 1.234. */
export function euro(cents: number): string {
  return Math.abs(cents) < 100_000 ? EURO_FULL.format(cents / 100) : EURO_ROUND.format(cents / 100);
}

export const euroExact = (cents: number): string => EURO_FULL.format(cents / 100);
export const count = (n: number): string => COUNT.format(n);

function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (abs >= 1_000) return `${trim(n / 1_000)}K`;
  return COUNT.format(Math.round(n * 10) / 10);
}
const trim = (n: number) => COUNT.format(Math.round(n * 10) / 10);

export type ChartUnit = "money" | "count" | "hours" | "percent";

/** Korte schrijfwijze voor langs de as: €1,2K, 12K, 8 u. */
export function formatTick(value: number, unit: ChartUnit): string {
  if (unit === "money") return `€${compact(value / 100)}`;
  if (unit === "hours") return `${compact(value)} u`;
  if (unit === "percent") return `${compact(value)}%`;
  return compact(value);
}

/** Volledige schrijfwijze voor in tooltips en tabellen. */
export function formatValue(value: number, unit: ChartUnit): string {
  if (unit === "money") return euroExact(value);
  if (unit === "hours") return `${COUNT.format(Math.round(value * 10) / 10)} uur`;
  if (unit === "percent") return `${COUNT.format(Math.round(value * 10) / 10)}%`;
  return COUNT.format(value);
}

export const percentOf = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function dateNl(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("nl-NL", { timeZone: TZ, ...opts });
}

/** Dag en tijd. Het jaartal staat er alleen bij als het niet dit jaar is. */
export function dateTimeNl(d: Date | string | null | undefined, now = new Date()): string {
  if (!d) return "—";
  const at = new Date(d);
  const sameYear = at.toLocaleDateString("nl-NL", { timeZone: TZ, year: "numeric" }) === now.toLocaleDateString("nl-NL", { timeZone: TZ, year: "numeric" });
  return at.toLocaleString("nl-NL", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", ...(sameYear ? {} : { year: "numeric" }) });
}

export function timeAgoNl(d: Date | string | null | undefined, now = Date.now()): string {
  if (!d) return "nooit";
  const minutes = Math.floor((now - new Date(d).getTime()) / 60_000);
  if (minutes < 1) return "zojuist";
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "gisteren";
  if (days < 30) return `${days} dagen geleden`;
  return dateNl(d);
}
