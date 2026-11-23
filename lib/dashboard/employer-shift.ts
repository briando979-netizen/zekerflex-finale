import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import type { Principal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { listCounterOffers } from "@/lib/offers/store";
import { listReplacementRequests } from "@/lib/replacements/store";
import { getUserAvatars } from "@/lib/profile/store";
import { reviewSummary } from "@/lib/reviews/store";
import { poolsInvitedToShift } from "@/lib/pools/store";
import { isCompTenant } from "@/lib/billing/comp";
import { opkomstVoor, type Opkomst } from "@/lib/employer/opkomst";
import { klusAutoAccept } from "@/lib/shifts/auto-accept";
import { GEEN_CIJFERS, werkerCijfersVoor, type WerkerCijfers } from "@/lib/employer/prestaties";
import { naamVoorMatch } from "@/lib/werkgever/naam";

// ---------------------------------------------------------------------------
// Everything an employer needs on a single shift: bezetting, kandidaten,
// matches (in de wachtrij), tegenbiedingen, vervangingsverzoeken. Read-only
// except the actions layer.
// ---------------------------------------------------------------------------

export interface EmployerShiftView {
  id: string;
  title: string;
  description: string | null;
  dresscode: string | null;
  /** "Extra informatie" for the worker (where to report, parking, what to bring) */
  extraInfo: string | null;
  branch: string;
  branchId: string;
  /** het bedrijf van de vestiging (o.a. voor de reservebank, lib/reservebank) */
  tenantId: string;
  city: string;
  /** straat en huisnummer van de vestiging */
  address: string;
  /** de plek van de vestiging, voor de speld op de kaart "Actieve regio's" */
  latitude: number;
  longitude: number;
  startsAt: Date;
  endsAt: Date;
  breakMinutes: number;
  hourlyRateCents: number;
  positions: number;
  /** annuleringstermijn in uren vóór aanvang (lib/shifts/annuleertermijn.ts) */
  annuleerUren: number;
  /** "Favorieten automatisch accepteren" staat aan op deze klus (lib/shifts/auto-accept.ts) */
  autoAcceptFavorieten: boolean;
  /** kostenplaats / PO-nummer voor de boekhouding */
  kostenplaats: string | null;
  status: string;
  visibility: string;
  invitedPool: { id: string; name: string } | null;
  skill: string | null;
  hours: number;
  grossPerSeatCents: number;
  platformFeeCents: number;
  /** kosteloos bedrijf (lib/billing/comp): the fee invoice is € 0 */
  platformFeeFree: boolean;
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
    /** vóór een reactie alleen de voornaam en de eerste letter van de achternaam (lib/werkgever/naam.ts) */
    name: string;
    score: number;
    travelMinutes: number;
    distanceMeters: number;
    withinGeofence: boolean;
    scoreBreakdown: unknown;
    status: string;
    avatarUrl: string | null;
    /** reacted on this shift: only then may the employer open the full profile card (api/werkgever/kandidaat) */
    reacted: boolean;
  }[];
  offers: {
    id: string;
    userId: string;
    /** vóór de match alleen de voornaam en de eerste letter van de achternaam (lib/werkgever/naam.ts) */
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
    /** opkomst op afgelopen diensten (lib/employer/opkomst.ts); null zonder afgelopen diensten */
    attendancePct: number | null;
    shiftsCompleted: number;
    cancellations: number;
    /** booked on another shift at that time: accepting would be refused (lib/shifts/worker-overlap) */
    busyElsewhere: boolean;
    /** prestaties (6 mnd), uren bij dit bedrijf (12 mnd), regio's, KVK en ervaring (lib/employer/prestaties.ts) */
    cijfers: WerkerCijfers;
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
      dresscode: true,
      extraInfo: true,
      startsAt: true,
      endsAt: true,
      breakMinutes: true,
      hourlyRateCents: true,
      positions: true,
      annuleerUren: true,
      kostenplaats: true,
      status: true,
      visibility: true,
      requiredSkill: { select: { name: true } },
      branch: { select: { id: true, name: true, city: true, tenantId: true, addressLine: true, latitude: true, longitude: true } },
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
          distanceMeters: true,
          withinGeofence: true,
          scoreBreakdown: true,
          status: true,
          freelancer: { select: { id: true, userId: true, user: { select: { fullName: true } } } },
        },
      },
    },
  });
  if (!shift) return null;

  const [replacements, allOffers, invitedPools, feeFree] = await Promise.all([
    listReplacementRequests(300),
    listCounterOffers(500),
    shift.visibility === "POOL_ONLY" ? poolsInvitedToShift(shift.id) : Promise.resolve([]),
    isCompTenant(shift.branch.tenantId),
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
  const [avatars, offerProfiles, offerReviews, busyRows, opkomst, autoAcceptFavorieten, cijfers] = await Promise.all([
    getUserAvatars(allUserIds),
    prisma.freelancerProfile.findMany({
      where: { userId: { in: offerUserIds } },
      select: { userId: true, reliabilityScore: true, badgeLevel: true },
    }),
    Promise.all(offerUserIds.map((id) => reviewSummary("freelancer", id))),
    // Reacted, but meanwhile booked elsewhere at the same time. Only the fact, never where.
    offerUserIds.length
      ? prisma.shiftAssignment.findMany({
          where: {
            cancelledAt: null,
            shiftId: { not: shift.id },
            freelancer: { userId: { in: offerUserIds } },
            shift: { startsAt: { lt: shift.endsAt }, endsAt: { gt: shift.startsAt } },
          },
          select: { freelancer: { select: { userId: true } } },
        })
      : Promise.resolve([]),
    // opkomst, aantal klussen en annuleringen op de reactie-rij (lib/employer/opkomst.ts); valt stil terug op niets
    opkomstVoor(offerUserIds).catch(() => new Map<string, Opkomst>()),
    // altijd achteraan toevoegen: de destructuring hierboven volgt deze volgorde
    klusAutoAccept(shift.id).catch(() => false),
    // de cijfers van de reactietabel; een storing laat de tabel staan, zonder cijfers
    werkerCijfersVoor(offerUserIds, { id: shift.id, tenantId: shift.branch.tenantId, title: shift.title, skill: shift.requiredSkill?.name ?? null, startsAt: shift.startsAt }).catch(
      () => new Map<string, WerkerCijfers>(),
    ),
  ]);
  const busyUsers = new Set(busyRows.map((r) => r.freelancer.userId));
  const avatarUrl = (userId: string): string | null => (avatars[userId] ? `/api/profile/${userId}/avatar` : null);
  const offerProfileByUser = new Map(offerProfiles.map((p) => [p.userId, p]));
  const offerReviewByUser = new Map(offerUserIds.map((id, i) => [id, offerReviews[i]!]));

  const hours = (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000 - shift.breakMinutes / 60;
  const grossPerSeat = Math.round(Math.max(0, hours) * shift.hourlyRateCents);

  return {
    id: shift.id,
    title: shift.title,
    description: shift.description,
    dresscode: shift.dresscode,
    extraInfo: shift.extraInfo,
    branch: shift.branch.name,
    branchId: shift.branch.id,
    tenantId: shift.branch.tenantId,
    city: shift.branch.city,
    address: shift.branch.addressLine,
    latitude: shift.branch.latitude,
    longitude: shift.branch.longitude,
    startsAt: shift.startsAt,
    endsAt: shift.endsAt,
    breakMinutes: shift.breakMinutes,
    hourlyRateCents: shift.hourlyRateCents,
    positions: shift.positions,
    annuleerUren: shift.annuleerUren,
    autoAcceptFavorieten,
    kostenplaats: shift.kostenplaats,
    status: shift.status,
    visibility: shift.visibility,
    invitedPool: invitedPools[0] ?? null,
    skill: shift.requiredSkill?.name ?? null,
    hours: Math.round(Math.max(0, hours) * 10) / 10,
    grossPerSeatCents: grossPerSeat,
    platformFeeCents: feeFree ? 0 : Math.round(Math.max(0, hours) * env.PLATFORM_FEE_PER_HOUR_CENTS),
    platformFeeFree: feeFree,
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
        name: naamVoorMatch(m.freelancer.user.fullName),
        score: m.score,
        travelMinutes: m.travelMinutes,
        distanceMeters: m.distanceMeters,
        withinGeofence: m.withinGeofence,
        scoreBreakdown: m.scoreBreakdown,
        status: m.status,
        avatarUrl: avatarUrl(m.freelancer.userId),
        reacted: offerUserIds.includes(m.freelancer.userId),
      })),
    offers: pendingOfferRows.map((o) => {
      const profile = offerProfileByUser.get(o.userId);
      const reviews = offerReviewByUser.get(o.userId);
      return {
        id: o.id,
        userId: o.userId,
        freelancerName: naamVoorMatch(o.freelancerName),
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
        attendancePct: opkomst.get(o.userId)?.attendancePct ?? null,
        shiftsCompleted: opkomst.get(o.userId)?.shiftsCompleted ?? 0,
        cancellations: opkomst.get(o.userId)?.cancellations ?? 0,
        busyElsewhere: busyUsers.has(o.userId),
        cijfers: cijfers.get(o.userId) ?? GEEN_CIJFERS,
      };
    }),
  };
}
