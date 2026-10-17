import { prisma } from "@/lib/prisma";
import { reviewSummary } from "@/lib/reviews/store";

// ---------------------------------------------------------------------------
// Levels & badges for freelancers, computed from what actually happened
// (completed klussen, reviews, bank use) — nothing to farm, nothing stored.
// Levels come with real perks, applied where the money moves:
//   - discount on the ZekerFlex Bank monthly fee (lib/bank/fees.ts)
//   - a free physical card from Diamant (lib/bank/cards.ts)
// ---------------------------------------------------------------------------

export interface Level {
  id: string;
  name: string;
  minXp: number;
  emoji: string;
  /** % off the monthly bank fee */
  feeDiscountPct: number;
  perks: string[];
}

export const LEVELS: Level[] = [
  { id: "starter", name: "Starter", minXp: 0, emoji: "🌱", feeDiscountPct: 0, perks: ["Toegang tot alle klussen", "Gratis virtuele pas"] },
  { id: "brons", name: "Brons", minXp: 500, emoji: "🥉", feeDiscountPct: 10, perks: ["Bronzen badge op je profiel", "10% korting op bankkosten"] },
  { id: "zilver", name: "Zilver", minXp: 1500, emoji: "🥈", feeDiscountPct: 25, perks: ["Zilveren badge", "25% korting op bankkosten", "Opvallen bij opdrachtgevers"] },
  { id: "goud", name: "Goud", minXp: 4000, emoji: "🥇", feeDiscountPct: 50, perks: ["Gouden badge", "50% korting op bankkosten", "Voorrang in de matching"] },
  { id: "platina", name: "Platina", minXp: 10000, emoji: "💎", feeDiscountPct: 100, perks: ["Platina badge", "Gratis ZekerFlex Bank", "Persoonlijke support"] },
  { id: "diamant", name: "Diamant", minXp: 25000, emoji: "👑", feeDiscountPct: 100, perks: ["Diamant badge", "Gratis ZekerFlex Bank", "Gratis fysieke betaalpas", "Uitnodiging voor events"] },
];

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  description: string;
  earned: boolean;
}

export interface RewardStatus {
  xp: number;
  level: Level;
  next: Level | null;
  progressPct: number;
  badges: Badge[];
  stats: { completedShifts: number; reviewAverage: number; reviewCount: number };
}

export function levelFor(xp: number): { level: Level; next: Level | null; progressPct: number } {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1]!.minXp) i++;
  const level = LEVELS[i]!;
  const next = LEVELS[i + 1] ?? null;
  const progressPct = next ? Math.round(((xp - level.minXp) / (next.minXp - level.minXp)) * 100) : 100;
  return { level, next, progressPct };
}

export async function rewardStatus(userId: string): Promise<RewardStatus | null> {
  const fp = await prisma.freelancerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!fp) return null;
  const [completedShifts, reviews, bank] = await Promise.all([
    prisma.timesheet.count({ where: { freelancerId: fp.id, status: { in: ["APPROVED", "PAID"] } } }),
    reviewSummary("freelancer", fp.id).catch(() => ({ average: 0, count: 0 })),
    prisma.bankAccount.findUnique({ where: { userId }, select: { id: true, _count: { select: { pots: true, cards: true, entries: true } } } }),
  ]);
  const usesBank = (bank?._count.entries ?? 0) > 0;
  const hasPot = (bank?._count.pots ?? 0) > 0;
  const hasCard = (bank?._count.cards ?? 0) > 0;
  const topRated = reviews.count >= 5 && reviews.average >= 4.8;

  const xp = completedShifts * 100 + reviews.count * 25 + (topRated ? 500 : 0) + (usesBank ? 100 : 0) + (hasPot ? 50 : 0) + (hasCard ? 50 : 0);
  const badges: Badge[] = [
    { id: "first", name: "Eerste klus", emoji: "🎉", description: "Je eerste klus afgerond", earned: completedShifts >= 1 },
    { id: "ten", name: "Doorzetter", emoji: "💪", description: "10 klussen afgerond", earned: completedShifts >= 10 },
    { id: "fifty", name: "Vakkracht", emoji: "🛠️", description: "50 klussen afgerond", earned: completedShifts >= 50 },
    { id: "hundred", name: "Legende", emoji: "🏆", description: "100 klussen afgerond", earned: completedShifts >= 100 },
    { id: "toprated", name: "Topbeoordeeld", emoji: "⭐", description: "Gemiddeld 4,8+ uit minstens 5 reviews", earned: topRated },
    { id: "banker", name: "Bankier", emoji: "🏦", description: "ZekerFlex Bank in gebruik", earned: usesBank },
    { id: "saver", name: "Spaarder", emoji: "🐷", description: "Een potje aangemaakt", earned: hasPot },
    { id: "card", name: "Pashouder", emoji: "💳", description: "Een ZekerFlex-betaalpas", earned: hasCard },
  ];
  return { xp, ...levelFor(xp), badges, stats: { completedShifts, reviewAverage: reviews.average, reviewCount: reviews.count } };
}

/** % off the monthly bank fee for this user (0 when not a freelancer). */
export async function feeDiscountPct(userId: string): Promise<number> {
  return (await rewardStatus(userId))?.level.feeDiscountPct ?? 0;
}
