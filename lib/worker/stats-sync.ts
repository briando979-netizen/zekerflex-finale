import type { BadgeLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { reviewSummary } from "@/lib/reviews/store";
import { levelFor } from "@/lib/rewards/levels";

// ---------------------------------------------------------------------------
// Dagelijks de profielcijfers van werkers uit echte data bijwerken. Drie
// velden op FreelancerProfile werden overal gelezen maar nergens geschreven:
//   - shiftsCompleted  werkpaspoort, kandidaatkaart, assistent: stond op 0
//   - acceptanceScore  matching (+/-0,025) en auto-acceptatie: stond op 0,5
//   - badgeLevel       matching-bonus en badge bij opdrachtgevers: stond op BRONZE
// badgeLevel volgt het niveau uit lib/rewards/levels.ts, maar berekend op WERK
// alleen (afgeronde diensten + reviews): bankgebruik geeft geen voorrang.
//   Starter/Brons → BRONZE · Zilver → SILVER · Goud → GOLD · Platina/Diamant → PLATINUM
// Zo klopt de belofte "Voorrang in de matching" vanaf Goud. reliabilityScore
// blijft van de no-show-sweep (lib/claims/no-show-sweep.ts).
// ---------------------------------------------------------------------------

const BADGE_BY_LEVEL: Record<string, BadgeLevel> = {
  starter: "BRONZE",
  brons: "BRONZE",
  zilver: "SILVER",
  goud: "GOLD",
  platina: "PLATINUM",
  diamant: "PLATINUM",
};
const BADGE_ORDER: BadgeLevel[] = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];

/** Aanbiedingen van het laatste jaar tellen voor de acceptatiescore. */
const ACCEPTANCE_WINDOW_DAYS = 365;
/** Zoveel denkbeeldige aanbiedingen op 50% trekken een korte historie naar het midden. */
const ACCEPTANCE_PRIOR = 4;

/** Zelfde XP-regels als rewardStatus, zonder de bank-onderdelen. */
export function workXp(completedShifts: number, reviewCount: number, reviewAverage: number): number {
  const topRated = reviewCount >= 5 && reviewAverage >= 4.8;
  return completedShifts * 100 + reviewCount * 25 + (topRated ? 500 : 0);
}

export function badgeForWork(completedShifts: number, reviewCount: number, reviewAverage: number): BadgeLevel {
  return BADGE_BY_LEVEL[levelFor(workXp(completedShifts, reviewCount, reviewAverage)).level.id] ?? "BRONZE";
}

/** Geaccepteerd / beantwoord, gladgestreken naar 0,5 bij weinig aanbiedingen. Twee decimalen. */
export function acceptanceRate(accepted: number, resolved: number): number {
  const rate = (accepted + 0.5 * ACCEPTANCE_PRIOR) / (resolved + ACCEPTANCE_PRIOR);
  return Math.round(rate * 100) / 100;
}

export interface StatsSyncResult {
  checked: number;
  changed: number;
  badgeUp: number;
  badgeDown: number;
}

export async function syncWorkerStats(now = new Date()): Promise<StatsSyncResult> {
  const since = new Date(now.getTime() - ACCEPTANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [profiles, completedRows, offerRows] = await Promise.all([
    prisma.freelancerProfile.findMany({ select: { id: true, badgeLevel: true, shiftsCompleted: true, acceptanceScore: true } }),
    prisma.timesheet.groupBy({
      by: ["freelancerId"],
      where: { status: { in: ["APPROVED", "PAID"] } },
      _count: { _all: true },
    }),
    // Alleen aanbiedingen die echt verstuurd zijn en een uitkomst hebben;
    // een automatische toewijzing is geen keuze van de werker.
    prisma.shiftMatch.groupBy({
      by: ["freelancerId", "status"],
      where: { notifiedAt: { not: null }, status: { in: ["ACCEPTED", "DECLINED", "EXPIRED"] }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const completed = new Map(completedRows.map((r) => [r.freelancerId, r._count._all]));
  const offers = new Map<string, { accepted: number; resolved: number }>();
  for (const r of offerRows) {
    const o = offers.get(r.freelancerId) ?? { accepted: 0, resolved: 0 };
    o.resolved += r._count._all;
    if (r.status === "ACCEPTED") o.accepted += r._count._all;
    offers.set(r.freelancerId, o);
  }

  const result: StatsSyncResult = { checked: profiles.length, changed: 0, badgeUp: 0, badgeDown: 0 };
  for (const p of profiles) {
    const shiftsCompleted = completed.get(p.id) ?? 0;
    const o = offers.get(p.id);
    // Zonder beantwoorde aanbiedingen houden we de huidige waarde (standaard 0,5).
    const acceptanceScore = o ? acceptanceRate(o.accepted, o.resolved) : p.acceptanceScore;
    const reviews = await reviewSummary("freelancer", p.id).catch(() => ({ average: 0, count: 0 }));
    const badgeLevel = badgeForWork(shiftsCompleted, reviews.count, reviews.average);

    if (shiftsCompleted === p.shiftsCompleted && acceptanceScore === p.acceptanceScore && badgeLevel === p.badgeLevel) continue;
    await prisma.freelancerProfile.update({ where: { id: p.id }, data: { shiftsCompleted, acceptanceScore, badgeLevel } });
    result.changed++;
    const delta = BADGE_ORDER.indexOf(badgeLevel) - BADGE_ORDER.indexOf(p.badgeLevel);
    if (delta > 0) result.badgeUp++;
    if (delta < 0) result.badgeDown++;
  }
  if (result.changed) logger.info("worker stats synced", { ...result });
  return result;
}
