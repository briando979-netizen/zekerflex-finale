import { vulIn } from "@/lib/i18n/vul-in";
import { amsterdamDayKey, amsterdamToUtc } from "@/lib/time/amsterdam";

// ISO-8601 week helpers (Monday-based, week 1 = the week containing the first Thursday). Pure.
//
// De loonweek loopt op Nederlandse tijd (12 nov 2026): van maandag 00:00 Europe/Amsterdam tot de volgende maandag.
// Daarvoor lag de grens op maandag 00:00 UTC (01:00 of 02:00 in Nederland), zodat een dienst die maandag tussen 00:00
// en 01:00/02:00 begon in de loonrun van de week ervoor viel. Gemeten op prod bij de overstap: 0 van de 15
// urenbriefjes in dat venster en geen afgeronde loonrun, dus geen bestaande week verschuift. Een dienst die toch al in
// een afgeronde loonrun van een buurweek staat, slaat buildWeeklyRun over (lib/payroll/al-betaald.ts).
//  - isoWeekOf: de week van de Nederlandse kalenderdag van een tijdstip;
//  - isoWeekRange: de kalenderdagen van de week (UTC-middernachten), voor labels en de pensioenmaand;
//  - isoWeekBereik: de echte tijdstippen (maandag 00:00 NL tot maandag 00:00 NL), voor de query's van de loonrun.

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
  // de Nederlandse kalenderdag: maandag 00:30 in Nederland is in UTC nog zondag
  const [jaar = 1970, maand = 1, dag = 1] = amsterdamDayKey(date).split("-").map(Number);
  const d = new Date(Date.UTC(jaar, maand - 1, dag));
  // Thursday in current week decides the year.
  const dayNr = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { year: d.getUTCFullYear(), week };
}

/** [start, end) — de kalenderdagen: maandag tot de volgende maandag als UTC-middernacht (labels, pensioenmaand). */
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

/**
 * [start, end) als echte tijdstippen: maandag 00:00 Nederlandse tijd tot de volgende maandag 00:00 (bij de wisseling
 * van zomer- naar wintertijd 7 dagen en 1 uur). Hiermee selecteert de loonrun de urenbriefjes.
 */
export function isoWeekBereik(w: IsoWeek): { start: Date; end: Date } {
  const { start, end } = isoWeekRange(w);
  const nl = (x: Date) => amsterdamToUtc(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
  return { start: nl(start), end: nl(end) };
}

/** De week ervoor en de week erna (voor het vangnet tegen dubbel betalen bij de overstap van de weekgrens). */
export function buurweken(w: IsoWeek): [IsoWeek, IsoWeek] {
  const { start, end } = isoWeekRange(w);
  return [isoWeekOf(new Date(start.getTime() - 24 * 3600 * 1000)), isoWeekOf(end)];
}

/** The most recently completed ISO week (last week relative to now). */
export function lastCompletedIsoWeek(now = new Date()): IsoWeek {
  const d = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  return isoWeekOf(d);
}

/** Zoals isoWeekLabel, maar uit een sjabloon ("week {week} · {van} t/m {tot} {jaar}") in de taal van de werker. */
export function isoWeekLabelIn(w: IsoWeek, sjabloon: string): string {
  const { start, end } = isoWeekRange(w);
  const fmt = (x: Date) => `${String(x.getUTCDate()).padStart(2, "0")}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
  const last = new Date(end.getTime() - 24 * 3600 * 1000);
  return vulIn(sjabloon, { week: w.week, van: fmt(start), tot: fmt(last), jaar: w.year });
}

export function isoWeekLabel(w: IsoWeek): string {
  const { start, end } = isoWeekRange(w);
  const fmt = (x: Date) =>
    `${String(x.getUTCDate()).padStart(2, "0")}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
  const last = new Date(end.getTime() - 24 * 3600 * 1000);
  return `week ${w.week} · ${fmt(start)} t/m ${fmt(last)} ${w.year}`;
}
