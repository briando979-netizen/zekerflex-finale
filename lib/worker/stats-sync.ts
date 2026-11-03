import type { BadgeLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { reviewSummary } from "@/lib/reviews/store";
import { levelFor } from "@/lib/rewards/levels";
import { LATE_CANCEL_RELIABILITY_PENALTY, NO_SHOW_RELIABILITY_PENALTY } from "@/lib/claims/policy";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { sendUserPush } from "@/lib/notifications/push";

// ---------------------------------------------------------------------------
// Dagelijks de profielcijfers van werkers uit echte data bijwerken. Drie
// velden op FreelancerProfile werden overal gelezen maar nergens geschreven:
//   - shiftsCompleted  werkpaspoort, kandidaatkaart, assistent: stond op 0
//   - acceptanceScore  matching (+/-0,025) en auto-acceptatie: stond op 0,5
//   - badgeLevel       matching-bonus en badge bij opdrachtgevers: stond op BRONZE
// badgeLevel volgt het niveau uit lib/rewards/levels.ts, maar berekend op WERK
// alleen (afgeronde diensten + reviews): bankgebruik geeft geen voorrang.
//   Starter/Brons → BRONZE · Zilver → SILVER · Goud → GOLD · Platina/Diamant → PLATINUM
// Zo klopt de belofte "Voorrang in de matching" vanaf Goud.
//
// reliabilityScore: de afzegroute (te laat, −0,05) en de no-show-sweep (−0,15)
// trekken er direct iets af, maar niets gaf het ooit terug — één misser bleef
// voor altijd. Nu rekenen we hem elke dag opnieuw uit dezelfde gebeurtenissen
// (de cancelReason op ShiftAssignment): een straf telt na een half jaar nog
// half, na 3 goed afgeronde diensten erna ook nog half, na twee jaar niet meer.
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

/** Na zoveel dagen telt een straf nog maar voor de helft. */
const RELIABILITY_HALF_LIFE_DAYS = 180;
/** Oudere missers tellen niet meer mee. */
const RELIABILITY_WINDOW_DAYS = 730;
/** Na zoveel goed afgeronde diensten ná een misser telt die misser nog half. */
export const CLEAN_SHIFTS_HALVING = 3;
/**
 * Begin van de cancelReason die de no-show-sweep en de afzegroute schrijven.
 * Op het begin, niet "bevat": achter de afzegtekst staat de vrije reden van de werker.
 */
const NO_SHOW_MARK = "Niet opgekomen";
const LATE_CANCEL_MARK = "Afgezegd door flexwerker (buiten de opzegtermijn)";

export interface Miss {
  kind: "no-show" | "late-cancel";
  at: Date;
}

export function missKind(cancelReason: string | null): Miss["kind"] | null {
  if (!cancelReason) return null;
  if (cancelReason.startsWith(NO_SHOW_MARK)) return "no-show";
  if (cancelReason.startsWith(LATE_CANCEL_MARK)) return "late-cancel";
  return null;
}

/**
 * 1 min de straffen, twee decimalen, nooit onder 0. Een straf halveert per
 * halfwaardetijd én per CLEAN_SHIFTS_HALVING goed afgeronde diensten erna —
 * zo klopt de belofte in components/app/ReliabilityRing.tsx dat elke dienst
 * op tijd meetelt voor herstel.
 */
export function reliabilityFrom(misses: Miss[], now: Date, cleanShiftDates: Date[] = []): number {
  let penalty = 0;
  for (const m of misses) {
    const ageDays = Math.max(0, (now.getTime() - m.at.getTime()) / 864e5);
    if (ageDays > RELIABILITY_WINDOW_DAYS) continue;
    const base = m.kind === "no-show" ? NO_SHOW_RELIABILITY_PENALTY : LATE_CANCEL_RELIABILITY_PENALTY;
    const cleanAfter = cleanShiftDates.filter((d) => d > m.at).length;
    penalty += base * 0.5 ** (ageDays / RELIABILITY_HALF_LIFE_DAYS) * 0.5 ** (cleanAfter / CLEAN_SHIFTS_HALVING);
  }
  return Math.max(0, Math.round((1 - penalty) * 100) / 100);
}

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

const BADGE_PUSH: Partial<Record<BadgeLevel, { title: string; body: string }>> = {
  SILVER: { title: "🥈 Je bent nu Zilver", body: "Opdrachtgevers zien je zilveren badge en je krijgt een klein voordeel in de matching." },
  GOLD: { title: "🥇 Je bent nu Goud", body: "Voorrang in de matching: je komt eerder in beeld bij nieuwe diensten." },
  PLATINUM: { title: "💎 Je bent nu Platina", body: "De hoogste badge, met de meeste voorrang in de matching. Knap werk!" },
};

/** Eén felicitatie per niveau, ooit: zakt iemand en stijgt hij weer, dan geen tweede push. */
async function congratulate(userId: string, level: BadgeLevel): Promise<void> {
  const msg = BADGE_PUSH[level];
  if (!msg) return;
  const key = `badge-push:${userId}:${level}`;
  if (await kvGet(key)) return;
  await kvSet(key, { at: new Date().toISOString() });
  await sendUserPush([userId], { ...msg, data: { type: "REWARD", url: "/dashboard/account", tag: `badge-${level}` }, ttlSeconds: 3 * 24 * 3600 });
}

export async function syncWorkerStats(now = new Date()): Promise<StatsSyncResult> {
  const since = new Date(now.getTime() - ACCEPTANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const missSince = new Date(now.getTime() - RELIABILITY_WINDOW_DAYS * 864e5);
  const [profiles, completedRows, offerRows, missRows] = await Promise.all([
    prisma.freelancerProfile.findMany({ select: { id: true, userId: true, badgeLevel: true, shiftsCompleted: true, acceptanceScore: true, reliabilityScore: true } }),
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
    prisma.shiftAssignment.findMany({
      where: {
        cancelledAt: { gte: missSince },
        OR: [{ cancelReason: { startsWith: NO_SHOW_MARK } }, { cancelReason: { startsWith: LATE_CANCEL_MARK } }],
      },
      select: { freelancerId: true, cancelledAt: true, cancelReason: true },
    }),
  ]);

  const misses = new Map<string, Miss[]>();
  for (const r of missRows) {
    const kind = missKind(r.cancelReason);
    if (!kind || !r.cancelledAt) continue;
    misses.set(r.freelancerId, [...(misses.get(r.freelancerId) ?? []), { kind, at: r.cancelledAt }]);
  }
  // Goed afgeronde diensten sinds het venster, alleen voor wie een misser heeft.
  const cleanShifts = new Map<string, Date[]>();
  if (misses.size) {
    const rows = await prisma.timesheet.findMany({
      where: { freelancerId: { in: [...misses.keys()] }, status: { in: ["APPROVED", "PAID"] }, scheduledStart: { gte: missSince } },
      select: { freelancerId: true, scheduledStart: true },
    });
    for (const r of rows) cleanShifts.set(r.freelancerId, [...(cleanShifts.get(r.freelancerId) ?? []), r.scheduledStart]);
  }

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
    const reliabilityScore = reliabilityFrom(misses.get(p.id) ?? [], now, cleanShifts.get(p.id) ?? []);

    if (
      shiftsCompleted === p.shiftsCompleted &&
      acceptanceScore === p.acceptanceScore &&
      badgeLevel === p.badgeLevel &&
      reliabilityScore === p.reliabilityScore
    ) {
      continue;
    }
    await prisma.freelancerProfile.update({ where: { id: p.id }, data: { shiftsCompleted, acceptanceScore, badgeLevel, reliabilityScore } });
    result.changed++;
    const delta = BADGE_ORDER.indexOf(badgeLevel) - BADGE_ORDER.indexOf(p.badgeLevel);
    if (delta > 0) {
      result.badgeUp++;
      await congratulate(p.userId, badgeLevel).catch((err) => logger.warn("badge push failed", { error: (err as Error).message }));
    }
    if (delta < 0) result.badgeDown++;
  }
  if (result.changed) logger.info("worker stats synced", { ...result });
  return result;
}
