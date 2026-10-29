import { prisma } from "@/lib/prisma";
import { explainMatch, type MatchReason } from "@/lib/matching/explain";

// ---------------------------------------------------------------------------
// AI-recruiter — sourcing uit de EIGEN kandidatenpool (geregistreerde uitzend-
// krachten/freelancers), niet via scraping van externe jobsites. Hergebruikt de
// matching-engine (ShiftMatch + scoreBreakdown) en explainMatch, en legt er een
// cert-screening + AI-outreach (zie draft.ts) overheen. De bron-laag is bewust
// dun zodat externe jobboards later via hun officiële API toegevoegd kunnen
// worden — zonder iets in deze shortlist-vorm te veranderen.
// ---------------------------------------------------------------------------

export interface VacancySummary {
  id: string;
  title: string;
  city: string;
  startsAt: string; // ISO
  hourlyRateCents: number;
  positions: number;
  candidateCount: number;
}

export interface ShortlistCandidate {
  freelancerId: string;
  userId: string;
  name: string;
  scorePct: number;
  verdict: string;
  reasons: MatchReason[];
  travelMinutes: number;
  status: string;
  certificates: { type: string; status: string; expiresOn: string | null }[];
}

const ACTIVE_MATCH = ["SCORED", "NOTIFIED", "VIEWED"] as const;

/** Openstaande uitzend-vacatures met het aantal gescoorde kandidaten erbij. */
export async function openUitzendVacancies(limit = 50): Promise<VacancySummary[]> {
  const shifts = await prisma.shift.findMany({
    where: { viaUitzendbureau: true, status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] } },
    orderBy: { startsAt: "asc" },
    take: limit,
    select: {
      id: true,
      title: true,
      startsAt: true,
      hourlyRateCents: true,
      positions: true,
      branch: { select: { city: true } },
      _count: { select: { matches: true } },
    },
  });
  return shifts.map((s) => ({
    id: s.id,
    title: s.title,
    city: s.branch.city,
    startsAt: s.startsAt.toISOString(),
    hourlyRateCents: s.hourlyRateCents,
    positions: s.positions,
    candidateCount: s._count.matches,
  }));
}

/** De beste kandidaten voor één vacature, met leesbare redenen + certificaten. */
export async function recruiterShortlist(shiftId: string, limit = 10): Promise<ShortlistCandidate[] | null> {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId }, select: { id: true } });
  if (!shift) return null;

  const matches = await prisma.shiftMatch.findMany({
    where: { shiftId, status: { in: [...ACTIVE_MATCH] } },
    orderBy: { score: "desc" },
    take: limit,
    select: {
      score: true,
      travelMinutes: true,
      distanceMeters: true,
      withinGeofence: true,
      scoreBreakdown: true,
      status: true,
      freelancer: { select: { id: true, userId: true, user: { select: { fullName: true } } } },
    },
  });

  const userIds = matches.map((m) => m.freelancer.userId);
  const certRows = userIds.length
    ? await prisma.certificate.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, type: true, status: true, expiresOn: true },
      })
    : [];
  const certsByUser = new Map<string, ShortlistCandidate["certificates"]>();
  for (const c of certRows) {
    const list = certsByUser.get(c.userId) ?? [];
    list.push({ type: c.type, status: c.status, expiresOn: c.expiresOn ? c.expiresOn.toISOString().slice(0, 10) : null });
    certsByUser.set(c.userId, list);
  }

  return matches.map((m) => {
    const ex = explainMatch({
      score: m.score,
      travelMinutes: m.travelMinutes,
      distanceMeters: m.distanceMeters,
      withinGeofence: m.withinGeofence,
      breakdown: m.scoreBreakdown,
    });
    return {
      freelancerId: m.freelancer.id,
      userId: m.freelancer.userId,
      name: m.freelancer.user.fullName,
      scorePct: ex.scorePct,
      verdict: ex.verdict,
      reasons: ex.reasons,
      travelMinutes: m.travelMinutes,
      status: m.status,
      certificates: certsByUser.get(m.freelancer.userId) ?? [],
    };
  });
}
