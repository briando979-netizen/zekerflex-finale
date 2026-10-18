import { prisma } from "@/lib/prisma";
import { reviewSummary } from "@/lib/reviews/store";

// ---------------------------------------------------------------------------
// Partner levels for companies, from what they actually did on ZekerFlex:
// completed (approved) klussen at their locations. Perks are real: a
// discount on the company's ZekerFlex Bank monthly fee (lib/bank/fees.ts).
// ---------------------------------------------------------------------------

export interface BusinessLevel {
  id: string;
  name: string;
  minShifts: number;
  emoji: string;
  feeDiscountPct: number;
  perks: string[];
}

export const BUSINESS_LEVELS: BusinessLevel[] = [
  { id: "starter", name: "Starter", minShifts: 0, emoji: "🌱", feeDiscountPct: 0, perks: ["Klussen plaatsen", "Bedrijfsrekening ZekerFlex Bank"] },
  { id: "partner", name: "Partner", minShifts: 25, emoji: "🤝", feeDiscountPct: 10, perks: ["Partner-badge bij je klussen", "10% korting op bankkosten"] },
  { id: "pro", name: "Pro Partner", minShifts: 100, emoji: "⭐", feeDiscountPct: 25, perks: ["Pro-badge — meer reacties van freelancers", "25% korting op bankkosten"] },
  { id: "elite", name: "Elite Partner", minShifts: 500, emoji: "🏅", feeDiscountPct: 50, perks: ["Elite-badge", "50% korting op bankkosten", "Voorrang bij spoedklussen"] },
  { id: "enterprise", name: "Enterprise", minShifts: 2000, emoji: "🏢", feeDiscountPct: 100, perks: ["Gratis ZekerFlex Bank voor je bedrijf", "Vaste accountmanager", "Eigen pool van vaste krachten"] },
];

export interface BusinessStatus {
  completedShifts: number;
  reviewAverage: number;
  reviewCount: number;
  level: BusinessLevel;
  next: BusinessLevel | null;
  progressPct: number;
}

export function businessLevelFor(shifts: number) {
  let i = 0;
  while (i + 1 < BUSINESS_LEVELS.length && shifts >= BUSINESS_LEVELS[i + 1]!.minShifts) i++;
  const level = BUSINESS_LEVELS[i]!;
  const next = BUSINESS_LEVELS[i + 1] ?? null;
  return { level, next, progressPct: next ? Math.round(((shifts - level.minShifts) / (next.minShifts - level.minShifts)) * 100) : 100 };
}

export async function businessStatus(tenantId: string): Promise<BusinessStatus> {
  const [completedShifts, reviews] = await Promise.all([
    prisma.timesheet.count({ where: { branch: { tenantId }, status: { in: ["APPROVED", "PAID"] } } }),
    reviewSummary("company", tenantId).catch(() => ({ average: 0, count: 0 })),
  ]);
  return { completedShifts, reviewAverage: reviews.average, reviewCount: reviews.count, ...businessLevelFor(completedShifts) };
}

export async function businessFeeDiscountPct(tenantId: string): Promise<number> {
  return (await businessStatus(tenantId)).level.feeDiscountPct;
}
