import { monthlyPlatformFeeCents, BASE_FEE_PER_HOUR_CENTS } from "@/lib/pricing/tiers";

// ---------------------------------------------------------------------------
// Rekentool "Wat kost een flexkracht?" — a traditional uitzendbureau (bruto
// uurloon × omrekenfactor) next to a zzp'er/flexwerker via ZekerFlex (zijn
// eigen uurtarief + de platformfee met staffel). Pure, no db: runs in the
// browser. The ZekerFlex-uitzendopslag is deliberately not in here — that is
// quoted per client (/uitzendbureau), not a published price.
// ---------------------------------------------------------------------------

export const WEEKS_PER_MONTH = 52 / 12;

export interface FlexCostInput {
  workers: number;
  hoursPerWeek: number;
  weeks: number;
  /** bruto uurloon van de uitzendkracht */
  wageCents: number;
  /** omrekenfactor van het uitzendbureau: bruto uurloon × factor = uurtarief */
  factor: number;
  /** uurtarief van de zzp'er/flexwerker via ZekerFlex, excl. btw */
  rateCents: number;
}

export interface FlexCostResult {
  totalHours: number;
  /** hours per calendar month across all workers — what the staffel counts */
  monthHours: number;
  bureau: { perHourCents: number; totalCents: number };
  zekerflex: { perHourCents: number; totalCents: number; rateCents: number; feePerHourCents: number; feeTotalCents: number };
  /** positive = ZekerFlex is cheaper by this much */
  savingCents: number;
  savingPerHourCents: number;
}

const clamp = (n: number, min: number, max: number) => (Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);

export function compareFlexCost(input: FlexCostInput): FlexCostResult {
  const workers = Math.round(clamp(input.workers, 0, 500));
  const hoursPerWeek = clamp(input.hoursPerWeek, 0, 60);
  const weeks = clamp(input.weeks, 0, 104);
  const factor = clamp(input.factor, 1, 4);
  const wageCents = Math.round(clamp(input.wageCents, 0, 50_000));
  const rateCents = Math.round(clamp(input.rateCents, 0, 50_000));

  const totalHours = workers * hoursPerWeek * weeks;
  // A job shorter than a month only fills that part of the month's staffel.
  const monthHours = workers * hoursPerWeek * Math.min(weeks, WEEKS_PER_MONTH);
  const feePerHourCents = monthHours > 0 ? monthlyPlatformFeeCents(monthHours) / monthHours : BASE_FEE_PER_HOUR_CENTS;

  const bureauPerHour = Math.round(wageCents * factor);
  const zfPerHour = Math.round(rateCents + feePerHourCents);
  const bureauTotal = Math.round(bureauPerHour * totalHours);
  const feeTotal = Math.round(feePerHourCents * totalHours);
  const zfTotal = Math.round(rateCents * totalHours) + feeTotal;

  return {
    totalHours,
    monthHours,
    bureau: { perHourCents: bureauPerHour, totalCents: bureauTotal },
    zekerflex: { perHourCents: zfPerHour, totalCents: zfTotal, rateCents, feePerHourCents: Math.round(feePerHourCents), feeTotalCents: feeTotal },
    savingCents: bureauTotal - zfTotal,
    savingPerHourCents: bureauPerHour - zfPerHour,
  };
}
