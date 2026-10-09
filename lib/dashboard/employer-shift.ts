import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import type { Principal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { listCounterOffers } from "@/lib/offers/store";
import { listReplacementRequests } from "@/lib/replacements/store";
import { getUserAvatars } from "@/lib/profile/store";
import { reviewSummary } from "@/lib/reviews/store";

// ---------------------------------------------------------------------------
// Everything an employer needs on a single shift: bezetting, kandidaten,
// matches (in de wachtrij), tegenbiedingen, vervangingsverzoeken. Read-only
// except the actions layer.
// ---------------------------------------------------------------------------

export interface EmployerShiftView {
  id: string;
  title: string;
  description: string | null;
  branch: string;
  branchId: string;
  city: string;
  startsAt: Date;
  endsAt: Date;
  breakMinutes: number;
  hourlyRateCents: number;
  positions: number;
  status: string;
  skill: string | null;
  hours: number;
  grossPerSeatCents: number;
  platformFeeCents: number;
  assigned: {
    assignmentId: string;
    freelancerId: string;
    userId: string;
    name: string;
    reliability: number;
    badge: string;
    avatarUrl: string | null;
    acceptedAt: Date;
    confirmed: boolean;
    replacementRequested: boolean;
    timesheetStatus: string | null;
  }[];
  queue: {
    freelancerId: string;
    userId: string;
    name: string;
    score: number;
    travelMinutes: number;
    status: string;
    avatarUrl: string | null;
  }[];
  offers: {
    id: string;
    userId: string;
    freelancerName: string;
    proposedRateCents: number;
    listedRateCents: number;
    note: string;
    status: string;
    at: string;
    avatarUrl: string | null;
    reliability: number | null;
    badge: string | null;
    reviewAverage: number;
    reviewCount: number;
  }[];
}

export async function getEmployerShift(
  principal: Principal,
  shiftId: string,
): Promise<EmployerShiftView | null> {
  const scope = await resolveEmployerScope(principal);
  const scopeWhere = scope.branchIds
    ? { id: { in: scope.branchIds } }
    : { tenantId: { in: scope.tenantIds } };

  const shift = await prisma.shift.findFirst({
    where: { AND: [{ id: shiftId }, { branch: scopeWhere }] },
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      endsAt: true,
      breakMinutes: true,
      hourlyRateCents: true,
      positions: true,
      status: true,
      requiredSkill: { select: { name: true } },
      branch: { select: { id: true, name: true, city: true } },
      assignments: {
        where: { cancelledAt: null },
        select: {
          id: true,
          acceptedAt: true,
          freelancer: {
            select: {
              id: true,
              reliabilityScore: true,
              badgeLevel: true,
              userId: true,
              user: { select: { fullName: true } },
            },
          },
          timesheet: { select: { status: true } },
        },
      },
      matches: {
        where: { status: { in: ["SCORED", "NOTIFIED", "VIEWED", "DECLINED", "EXPIRED"] } },
        orderBy: { score: "desc" },
        take: 20,
        select: {
          score: true,
          travelMinutes: true,
          status: true,
          freelancer: { select: { id: true, userId: true, user: { select: { fullName: true } } } },
        },
      },
    },
  });
  if (!shift) return null;

  const [replacements, allOffers] = await Promise.all([
    listReplacementRequests(300),
    listCounterOffers(500),
  ]);
  const replacementAssignmentIds = new Set(
    replacements.filter((r) => r.status === "open").map((r) => r.assignmentId),
  );
  // confirmations live in each freelancer's prefs — skip a per-user read here;
  // the employer view treats "confirmed" as best-effort false unless we add it.

  // A pending reaction only carried a name + proposed rate — nothing to help
  // decide who to pick. Fetch photo/reliability/reviews for everyone shown
  // on the page (reactions, already-assigned, queue) in one batch.
  const pendingOfferRows = allOffers.filter((o) => o.shiftId === shift.id && o.status !== "withdrawn");
  const offerUserIds = pendingOfferRows.map((o) => o.userId);
  const allUserIds = [
    ...new Set([
      ...offerUserIds,
      ...shift.assignments.map((a) => a.freelancer.userId),
      ...shift.matches.map((m) => m.freelancer.userId),
    ]),
  ];
  const [avatars, offerProfiles, offerReviews] = await Promise.all([
    getUserAvatars(allUserIds),
    prisma.freelancerProfile.findMany({
      where: { userId: { in: offerUserIds } },
      select: { userId: true, reliabilityScore: true, badgeLevel: true },
    }),
    Promise.all(offerUserIds.map((id) => reviewSummary("freelancer", id))),
  ]);
  const avatarUrl = (userId: string): string | null => (avatars[userId] ? `/api/profile/${userId}/avatar` : null);
  const offerProfileByUser = new Map(offerProfiles.map((p) => [p.userId, p]));
  const offerReviewByUser = new Map(offerUserIds.map((id, i) => [id, offerReviews[i]!]));

  const hours = (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000 - shift.breakMinutes / 60;
  const grossPerSeat = Math.round(Math.max(0, hours) * shift.hourlyRateCents);

  return {
    id: shift.id,
    title: shift.title,
    description: shift.description,
    branch: shift.branch.name,
    branchId: shift.branch.id,
    city: shift.branch.city,
    startsAt: shift.startsAt,
    endsAt: shift.endsAt,
    breakMinutes: shift.breakMinutes,
    hourlyRateCents: shift.hourlyRateCents,
    positions: shift.positions,
    status: shift.status,
    skill: shift.requiredSkill?.name ?? null,
    hours: Math.round(Math.max(0, hours) * 10) / 10,
    grossPerSeatCents: grossPerSeat,
    platformFeeCents: Math.round(Math.max(0, hours) * env.PLATFORM_FEE_PER_HOUR_CENTS),
    assigned: shift.assignments.map((a) => ({
      assignmentId: a.id,
      freelancerId: a.freelancer.id,
      userId: a.freelancer.userId,
      name: a.freelancer.user.fullName,
      reliability: a.freelancer.reliabilityScore,
      badge: a.freelancer.badgeLevel,
      avatarUrl: avatarUrl(a.freelancer.userId),
      acceptedAt: a.acceptedAt,
      confirmed: false,
      replacementRequested: replacementAssignmentIds.has(a.id),
      timesheetStatus: a.timesheet?.status ?? null,
    })),
    queue: shift.matches
      .filter((m) => !shift.assignments.some((a) => a.freelancer.id === m.freelancer.id))
      .map((m) => ({
        freelancerId: m.freelancer.id,
        userId: m.freelancer.userId,
        name: m.freelancer.user.fullName,
        score: m.score,
        travelMinutes: m.travelMinutes,
        status: m.status,
        avatarUrl: avatarUrl(m.freelancer.userId),
      })),
    offers: pendingOfferRows.map((o) => {
      const profile = offerProfileByUser.get(o.userId);
      const reviews = offerReviewByUser.get(o.userId);
      return {
        id: o.id,
        userId: o.userId,
        freelancerName: o.freelancerName,
        proposedRateCents: o.proposedRateCents,
        listedRateCents: o.listedRateCents,
        note: o.note,
        status: o.status,
        at: o.at,
        avatarUrl: avatarUrl(o.userId),
        reliability: profile?.reliabilityScore ?? null,
        badge: profile?.badgeLevel ?? null,
        reviewAverage: reviews?.average ?? 0,
        reviewCount: reviews?.count ?? 0,
      };
    }),
  };
}
