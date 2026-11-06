import { amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Weken van de planner: ISO-weken in Nederlandse tijd, als sleutel "2026-W46".
// Puur bestand (ook voor de browser).
// ---------------------------------------------------------------------------

export interface PlanWeek {
  sleutel: string;
  /** maandag 00:00 NL, als UTC */
  van: Date;
  /** de maandag erna 00:00 NL, als UTC (exclusief) */
  tot: Date;
}

const WEEK = /^(\d{4})-W(\d{2})$/;

/** ISO-weeknummer en -jaar van een datum (Nederlandse tijd). */
export function isoWeekVan(d: Date): { jaar: number; week: number } {
  const p = amsterdamParts(d);
  // ISO-regel: donderdag van dezelfde week bepaalt het jaar
  const weekdag = p.weekday === 0 ? 7 : p.weekday;
  const donderdag = new Date(Date.UTC(p.year, p.month - 1, p.day + 4 - weekdag));
  const jaar = donderdag.getUTCFullYear();
  const eersteDonderdag = new Date(Date.UTC(jaar, 0, 4));
  const ed = eersteDonderdag.getUTCDay() === 0 ? 7 : eersteDonderdag.getUTCDay();
  const start = new Date(Date.UTC(jaar, 0, 4 - ed + 1));
  const week = Math.floor((donderdag.getTime() - start.getTime()) / (7 * 86_400_000)) + 1;
  return { jaar, week };
}

export function weekSleutelVan(d: Date): string {
  const { jaar, week } = isoWeekVan(d);
  return `${jaar}-W${String(week).padStart(2, "0")}`;
}

/** "2026-W46" → maandag t/m zondag in NL-tijd; null bij een onbruikbare sleutel. */
export function planWeek(sleutel: string): PlanWeek | null {
  const m = WEEK.exec(sleutel.trim());
  if (!m) return null;
  const jaar = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  const jan4 = new Date(Date.UTC(jaar, 0, 4));
  const wd = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const maandag1 = new Date(Date.UTC(jaar, 0, 4 - wd + 1));
  const maandag = new Date(maandag1.getTime() + (week - 1) * 7 * 86_400_000);
  const volgende = new Date(maandag.getTime() + 7 * 86_400_000);
  const van = amsterdamToUtc(maandag.getUTCFullYear(), maandag.getUTCMonth() + 1, maandag.getUTCDate());
  const tot = amsterdamToUtc(volgende.getUTCFullYear(), volgende.getUTCMonth() + 1, volgende.getUTCDate());
  if (weekSleutelVan(van) !== `${jaar}-W${String(week).padStart(2, "0")}`) return null;
  return { sleutel: `${jaar}-W${String(week).padStart(2, "0")}`, van, tot };
}

/** De week erna of ervoor. */
export function weekPlus(sleutel: string, n: number): string {
  const w = planWeek(sleutel);
  if (!w) return sleutel;
  return weekSleutelVan(new Date(w.van.getTime() + n * 7 * 86_400_000 + 12 * 3_600_000));
}

/** "ma 9 – zo 15 nov 2026" voor boven het scherm. */
export function weekLabel(sleutel: string): string {
  const w = planWeek(sleutel);
  if (!w) return sleutel;
  const laatste = new Date(w.tot.getTime() - 12 * 3_600_000);
  const f = (d: Date, metJaar: boolean) => d.toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", ...(metJaar ? { year: "numeric" } : {}) });
  return `week ${Number(sleutel.slice(6))}: ${f(new Date(w.van.getTime() + 12 * 3_600_000), false)} – ${f(laatste, true)}`;
}
