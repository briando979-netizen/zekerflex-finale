// ---------------------------------------------------------------------------
// Rekentool "Welk uurtarief heb je nodig als zzp'er?" — from the netto income
// you want to the hourly rate that pays for it, and back. Belasting is a
// reservation percentage of the profit after pension/AOV (the same rule of
// thumb the Belasting-potje in lib/bank/tax.ts uses), not the tax tables:
// heffingskortingen, zelfstandigenaftrek and Zvw make the real figure
// personal. Pure, no db: runs in the browser.
// ---------------------------------------------------------------------------

/** Hours a year on your business for the zelfstandigenaftrek (also in lib/worker/milestones.ts). */
export const URENCRITERIUM_HOURS = 1225;
const DAY_HOURS = 8;

export interface ZzpBase {
  hoursPerWeek: number;
  /** share of your working hours you can bill, in % (rest = acquisitie, administratie) */
  billablePct: number;
  vacationWeeks: number;
  /** feestdagen + ziekte, in workdays */
  offDays: number;
  costsPerMonthCents: number;
  pensionPerMonthCents: number;
  aovPerMonthCents: number;
  /** belastingreservering, % of profit after pension and AOV */
  taxPct: number;
}

export interface ZzpResult {
  rateCents: number;
  dayRateCents: number;
  workedHours: number;
  billableHours: number;
  meetsUrencriterium: boolean;
  /** per year */
  revenueCents: number;
  costsCents: number;
  pensionAovCents: number;
  taxCents: number;
  nettoCents: number;
  nettoPerMonthCents: number;
}

const clamp = (n: number, min: number, max: number) => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);

function normalise(b: ZzpBase): ZzpBase {
  return {
    hoursPerWeek: clamp(b.hoursPerWeek, 0, 80),
    billablePct: clamp(b.billablePct, 0, 100),
    vacationWeeks: clamp(b.vacationWeeks, 0, 52),
    offDays: clamp(b.offDays, 0, 260),
    costsPerMonthCents: Math.round(clamp(b.costsPerMonthCents, 0, 10_000_000)),
    pensionPerMonthCents: Math.round(clamp(b.pensionPerMonthCents, 0, 10_000_000)),
    aovPerMonthCents: Math.round(clamp(b.aovPerMonthCents, 0, 10_000_000)),
    taxPct: clamp(b.taxPct, 0, 60),
  };
}

export function workHours(input: ZzpBase): { workedHours: number; billableHours: number } {
  const b = normalise(input);
  const workedHours = Math.max(0, (52 - b.vacationWeeks) * b.hoursPerWeek - (b.offDays * b.hoursPerWeek) / 5);
  return { workedHours: Math.round(workedHours), billableHours: Math.round((workedHours * b.billablePct) / 100) };
}

function result(b: ZzpBase, rateCents: number, revenueCents: number, taxCents: number, nettoCents: number): ZzpResult {
  const { workedHours, billableHours } = workHours(b);
  return {
    rateCents,
    dayRateCents: rateCents * DAY_HOURS,
    workedHours,
    billableHours,
    meetsUrencriterium: workedHours >= URENCRITERIUM_HOURS,
    revenueCents,
    costsCents: b.costsPerMonthCents * 12,
    pensionAovCents: (b.pensionPerMonthCents + b.aovPerMonthCents) * 12,
    taxCents,
    nettoCents,
    nettoPerMonthCents: Math.round(nettoCents / 12),
  };
}

/** The hourly rate (excl. btw) you need to keep `nettoPerMonthCents` a month. */
export function requiredRate(input: ZzpBase & { nettoPerMonthCents: number }): ZzpResult {
  const b = normalise(input);
  const netto = Math.round(clamp(input.nettoPerMonthCents, 0, 10_000_000)) * 12;
  const taxable = b.taxPct >= 100 ? netto : netto / (1 - b.taxPct / 100);
  const taxCents = Math.round(taxable - netto);
  const revenueCents = Math.round(taxable + (b.pensionPerMonthCents + b.aovPerMonthCents + b.costsPerMonthCents) * 12);
  const { billableHours } = workHours(b);
  const rateCents = billableHours > 0 ? Math.ceil(revenueCents / billableHours) : 0;
  return result(b, rateCents, revenueCents, taxCents, netto);
}

/** What you keep a year at a given hourly rate (excl. btw). */
export function nettoFromRate(input: ZzpBase & { rateCents: number }): ZzpResult {
  const b = normalise(input);
  const rateCents = Math.round(clamp(input.rateCents, 0, 100_000));
  const { billableHours } = workHours(b);
  const revenueCents = rateCents * billableHours;
  const taxable = revenueCents - (b.costsPerMonthCents + b.pensionPerMonthCents + b.aovPerMonthCents) * 12;
  const taxCents = taxable > 0 ? Math.round((taxable * b.taxPct) / 100) : 0;
  return result(b, rateCents, revenueCents, taxCents, taxable - taxCents);
}
