// ---------------------------------------------------------------------------
// CAO toeslagen-engine — automatische berekening van:
//   • nacht-, zaterdag-, zondag- en feestdagtoeslagen
//   • overuren (dag- en weekdrempel)
//   • minimumloon-vloer (WML) inclusief jeugdloon
//   • per branche-CAO instelbare percentages
// Pure functies, integer centen. Geen DB / filesystem.
// ---------------------------------------------------------------------------

export interface CaoRates {
  key: string;
  label: string;
  /** toeslag op uren tussen nightFromHour en nightToHour (fractie, 0.3 = +30%) */
  nightPct: number;
  nightFromHour: number;
  nightToHour: number;
  saturdayPct: number;
  /** vanaf welk uur op zaterdag de toeslag geldt (0 = hele dag) */
  saturdayFromHour: number;
  sundayPct: number;
  holidayPct: number;
  /** > dit aantal gewerkte uren op één dag telt als overwerk */
  overtimeDailyHours: number;
  /** > dit aantal gewerkte uren in de week telt als overwerk */
  overtimeWeeklyHours: number;
  overtimePct: number;
}

const BASE: Omit<CaoRates, "key" | "label"> = {
  nightPct: 0.3,
  nightFromHour: 0,
  nightToHour: 6,
  saturdayPct: 0.25,
  saturdayFromHour: 0,
  sundayPct: 0.5,
  holidayPct: 1.0,
  overtimeDailyHours: 9,
  overtimeWeeklyHours: 40,
  overtimePct: 0.25,
};

export const CAO_TABLES: Record<string, CaoRates> = {
  abu: { key: "abu", label: "ABU – Uitzendkrachten", ...BASE },
  horeca: {
    key: "horeca",
    label: "Horeca",
    ...BASE,
    nightPct: 0,
    saturdayPct: 0,
    sundayPct: 0,
    holidayPct: 1.0,
    overtimeWeeklyHours: 38,
  },
  retail: {
    key: "retail",
    label: "Retail non-food",
    ...BASE,
    nightPct: 0.5,
    nightFromHour: 21,
    nightToHour: 6,
    saturdayPct: 0,
    sundayPct: 1.0,
    overtimeWeeklyHours: 37,
  },
  logistiek: {
    key: "logistiek",
    label: "Logistiek / groothandel",
    ...BASE,
    nightPct: 0.4,
    nightFromHour: 22,
    nightToHour: 6,
    saturdayPct: 0.3,
    sundayPct: 0.75,
  },
  bouw: {
    key: "bouw",
    label: "Bouw & infra",
    ...BASE,
    nightPct: 0.4,
    saturdayPct: 0.5,
    sundayPct: 1.0,
    overtimeDailyHours: 8,
    overtimePct: 0.35,
  },
  schoonmaak: {
    key: "schoonmaak",
    label: "Schoonmaak",
    ...BASE,
    nightPct: 0.35,
    nightFromHour: 0,
    nightToHour: 6,
    saturdayPct: 0.25,
    sundayPct: 0.6,
  },
};

export function caoRates(key?: string | null): CaoRates {
  return (key ? CAO_TABLES[key] : undefined) ?? CAO_TABLES.abu!;
}
export function caoOptions(): { key: string; label: string }[] {
  return Object.values(CAO_TABLES).map((c) => ({ key: c.key, label: c.label }));
}

// --- Wettelijk minimumloon (per uur) --------------------------------------
// "minimumloon updates" = nieuwe regel toevoegen. age21plus in centen/uur.
const WML_HOURLY: { from: string; age21plus: number }[] = [
  { from: "2024-07-01", age21plus: 1406 },
  { from: "2025-01-01", age21plus: 1443 },
  { from: "2025-07-01", age21plus: 1479 },
  { from: "2026-01-01", age21plus: 1513 }, // indicatief
  { from: "2026-07-01", age21plus: 1546 }, // indicatief
];

// Jeugdloon als percentage van het 21+ minimumloon.
const YOUTH_PCT: Record<number, number> = {
  15: 0.3,
  16: 0.345,
  17: 0.395,
  18: 0.5,
  19: 0.6,
  20: 0.8,
};

export function ageOn(birthDate: string | Date | null | undefined, on: Date): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  let age = on.getFullYear() - b.getFullYear();
  const m = on.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < b.getDate())) age -= 1;
  return Math.max(0, age);
}

/** Minimum brutoloon per uur voor een leeftijd op een datum (centen). */
export function minimumHourlyCents(age: number | null, on: Date): number {
  const row =
    [...WML_HOURLY].reverse().find((r) => new Date(r.from).getTime() <= on.getTime()) ?? WML_HOURLY[0]!;
  const pct = age != null && age < 21 ? (YOUTH_PCT[age] ?? YOUTH_PCT[15]!) : 1;
  return Math.round(row.age21plus * pct);
}

// --- Feestdagen (NL) -----------------------------------------------------
function easterSunday(year: number): Date {
  // Anonymous Gregorian algorithm.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function publicHolidaysOf(year: number): Set<string> {
  const easter = easterSunday(year);
  const set = new Set<string>([
    `${year}-01-01`, // Nieuwjaarsdag
    `${year}-04-27`, // Koningsdag
    `${year}-05-05`, // Bevrijdingsdag
    `${year}-12-25`, // Eerste kerstdag
    `${year}-12-26`, // Tweede kerstdag
    iso(addDays(easter, -2)), // Goede Vrijdag
    iso(easter), // Eerste paasdag
    iso(addDays(easter, 1)), // Tweede paasdag
    iso(addDays(easter, 39)), // Hemelvaartsdag
    iso(addDays(easter, 49)), // Eerste pinksterdag
    iso(addDays(easter, 50)), // Tweede pinksterdag
  ]);
  return set;
}

export function isPublicHoliday(d: Date): boolean {
  return publicHolidaysOf(d.getFullYear()).has(iso(d));
}

// --- Segmentindeling van een gewerkte dienst ----------------------------

export interface CaoBuckets {
  regulierHours: number;
  nachtHours: number;
  zaterdagHours: number;
  zondagHours: number;
  feestdagHours: number;
  overwerkHours: number;
}

export interface CaoLineResult extends CaoBuckets {
  /** effectief uurtarief na WML-vloer */
  baseCentsPerHour: number;
  wmlFloorApplied: boolean;
  workedHours: number;
  /** basis (uren × basistarief) */
  baseCents: number;
  /** som van alle toeslagen (nacht/weekend/feestdag/overwerk) */
  toeslagCents: number;
  nachtCents: number;
  weekendCents: number;
  feestdagCents: number;
  overwerkCents: number;
  grossCents: number;
}

const STEP_MIN = 15;

/**
 * Splits een dienst in toeslagsegmenten en rekent basis + toeslagen uit.
 * `weeklyHoursBefore` = de al gewerkte uren in dezelfde week (voor de weekdrempel).
 */
export function computeCaoLine(input: {
  startISO: string;
  endISO: string;
  breakMinutes: number;
  hourlyRateCents: number;
  age: number | null;
  cao: CaoRates;
  weeklyHoursBefore: number;
}): CaoLineResult {
  const start = new Date(input.startISO);
  const end = new Date(input.endISO);
  const cao = input.cao;

  const base = minimumHourlyCents(input.age, start);
  const wmlFloorApplied = input.hourlyRateCents < base;
  const baseCentsPerHour = Math.max(input.hourlyRateCents, base);

  const grossMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const workedMinutes = Math.max(0, grossMinutes - Math.max(0, input.breakMinutes));
  const scale = grossMinutes > 0 ? workedMinutes / grossMinutes : 0;

  const b: CaoBuckets = {
    regulierHours: 0,
    nachtHours: 0,
    zaterdagHours: 0,
    zondagHours: 0,
    feestdagHours: 0,
    overwerkHours: 0,
  };
  let overwerkCents = 0;
  let nachtCents = 0;
  let weekendCents = 0;
  let feestdagCents = 0;

  let dailyHours = 0;
  let weeklyHours = input.weeklyHoursBefore;
  const stepHours = (STEP_MIN / 60) * scale;

  for (let t = start.getTime(); t < end.getTime(); t += STEP_MIN * 60000) {
    const at = new Date(t);
    const day = at.getDay(); // 0 = zo, 6 = za
    const hour = at.getHours();

    const inNight =
      cao.nightFromHour <= cao.nightToHour
        ? hour >= cao.nightFromHour && hour < cao.nightToHour
        : hour >= cao.nightFromHour || hour < cao.nightToHour;

    // hoogste toeslag wint (niet stapelend), behalve overwerk dat er bovenop komt
    let toeslagPct = 0;
    if (isPublicHoliday(at)) {
      toeslagPct = cao.holidayPct;
      b.feestdagHours += stepHours;
    } else if (day === 0) {
      toeslagPct = cao.sundayPct;
      b.zondagHours += stepHours;
    } else if (day === 6 && hour >= cao.saturdayFromHour) {
      toeslagPct = cao.saturdayPct;
      b.zaterdagHours += stepHours;
    } else if (inNight) {
      toeslagPct = cao.nightPct;
      b.nachtHours += stepHours;
    } else {
      b.regulierHours += stepHours;
    }

    dailyHours += stepHours;
    weeklyHours += stepHours;
    const isOvertime =
      dailyHours > cao.overtimeDailyHours || weeklyHours > cao.overtimeWeeklyHours;
    if (isOvertime) b.overwerkHours += stepHours;

    const toeslagAmount = Math.round(baseCentsPerHour * toeslagPct * stepHours);
    if (toeslagPct === cao.holidayPct && b.feestdagHours) feestdagCents += toeslagAmount;
    else if (toeslagPct === cao.sundayPct || toeslagPct === cao.saturdayPct) weekendCents += toeslagAmount;
    else if (toeslagPct === cao.nightPct && toeslagPct > 0) nachtCents += toeslagAmount;

    if (isOvertime) overwerkCents += Math.round(baseCentsPerHour * cao.overtimePct * stepHours);
  }

  const round1 = (n: number) => Math.round(n * 100) / 100;
  for (const k of Object.keys(b) as (keyof CaoBuckets)[]) b[k] = round1(b[k]);

  const workedHours = round1(workedMinutes / 60);
  const baseCents = Math.round(baseCentsPerHour * workedHours);
  const toeslagCents = nachtCents + weekendCents + feestdagCents + overwerkCents;

  return {
    ...b,
    baseCentsPerHour,
    wmlFloorApplied,
    workedHours,
    baseCents,
    toeslagCents,
    nachtCents,
    weekendCents,
    feestdagCents,
    overwerkCents,
    grossCents: baseCents + toeslagCents,
  };
}
