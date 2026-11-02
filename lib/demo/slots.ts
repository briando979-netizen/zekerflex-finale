// Demo scheduling helpers. No real calendar integration — these produce the
// weekday dates and half-hour slots a requester can express a preference for;
// the ZekerFlex team confirms the appointment by e-mail.

import { amsterdamParts } from "@/lib/time/amsterdam";

export const DEMO_TIME_SLOTS = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
];

/** true when `iso` (YYYY-MM-DD) is a selectable demo date: a weekday, from
 *  tomorrow up to ~8 weeks out — in Dutch days, so the page and the (UTC)
 *  server agree around midnight. */
export function isSelectableDemoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return false;
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const t = amsterdamParts(new Date());
  const fromToday = (n: number) => new Date(Date.UTC(t.year, t.month - 1, t.day + n)).toISOString().slice(0, 10);
  return iso >= fromToday(1) && iso <= fromToday(56);
}

export function isValidDemoTime(t: string): boolean {
  return DEMO_TIME_SLOTS.includes(t);
}

const NL_DAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const NL_MONTHS = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

export function formatDemoDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${NL_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${NL_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
