// ---------------------------------------------------------------------------
// Vraag-vooruitblik: een eerlijke, statistische voorspelling van de drukte voor
// de komende dagen op basis van je eigen shift-historie. GEEN helderziendheid —
// het is het gemiddelde aantal shifts/posities per weekdag over de afgelopen
// weken, geprojecteerd op de komende week. Zuivere functie → makkelijk te testen.
// ---------------------------------------------------------------------------

export interface DemandDay {
  date: string; // YYYY-MM-DD (lokaal)
  weekday: string; // NL-weekdagnaam
  expectedShifts: number; // verwacht aantal shifts die dag
  expectedPositions: number; // verwacht aantal in te vullen plekken
}

export interface DemandForecast {
  windowWeeks: number; // aantal weken historie waarop dit gebaseerd is
  sampleShifts: number; // aantal shifts in het venster
  busiestWeekday: string | null; // drukste weekdag (null bij geen data)
  days: DemandDay[]; // de komende dagen
}

const NL_WEEKDAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${week}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function forecastDemand(
  history: { startsAt: Date; positions: number }[],
  opts: { from?: Date; windowWeeks?: number; days?: number } = {},
): DemandForecast {
  const from = opts.from ?? new Date();
  const maxWeeks = opts.windowWeeks ?? 8;
  const horizon = opts.days ?? 7;

  const windowStart = new Date(from.getTime() - maxWeeks * 7 * 86_400_000);
  const inWindow = history.filter((h) => h.startsAt >= windowStart && h.startsAt <= from);

  // Som per weekdag (0=zondag .. 6=zaterdag) + het aantal distinct weken in de data,
  // zodat we door het juiste aantal weken delen (ook als er weinig historie is).
  const shiftsByWd = [0, 0, 0, 0, 0, 0, 0];
  const positionsByWd = [0, 0, 0, 0, 0, 0, 0];
  const weeks = new Set<string>();
  for (const h of inWindow) {
    const wd = h.startsAt.getDay();
    shiftsByWd[wd] = (shiftsByWd[wd] ?? 0) + 1;
    positionsByWd[wd] = (positionsByWd[wd] ?? 0) + Math.max(0, h.positions);
    weeks.add(isoWeekKey(h.startsAt));
  }
  const effectiveWeeks = Math.max(1, weeks.size);

  const days: DemandDay[] = [];
  for (let i = 1; i <= horizon; i++) {
    const dt = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const wd = dt.getDay();
    days.push({
      date: dateKey(dt),
      weekday: NL_WEEKDAYS[wd] ?? "",
      expectedShifts: round1((shiftsByWd[wd] ?? 0) / effectiveWeeks),
      expectedPositions: round1((positionsByWd[wd] ?? 0) / effectiveWeeks),
    });
  }

  // Drukste weekdag op basis van verwachte posities.
  let busiestWeekday: string | null = null;
  let best = 0;
  for (let wd = 0; wd < 7; wd++) {
    const v = (positionsByWd[wd] ?? 0) / effectiveWeeks;
    if (v > best) {
      best = v;
      busiestWeekday = NL_WEEKDAYS[wd] ?? null;
    }
  }

  return { windowWeeks: effectiveWeeks, sampleShifts: inWindow.length, busiestWeekday, days };
}
