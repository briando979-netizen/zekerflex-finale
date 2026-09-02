import { prisma } from "@/lib/prisma";
import { haversineMeters } from "@/lib/geo/geofencing";
import { getPrefs, type UserPrefs } from "@/lib/prefs/store";
import { travelByMode, fastestMode, type ModeEstimate, type TravelModeKey } from "@/lib/geo/travel-modes";
import { detectSeries, type Series } from "@/lib/shifts/series";
import { listReplacementRequests } from "@/lib/replacements/store";
import { offersForUser, type OfferStatus } from "@/lib/offers/store";

// ---------------------------------------------------------------------------
// Freelancer marketplace. Read-only queries + a lightweight match score.
// Preferences (min rate, max travel, availability) come from storage/prefs.
// ---------------------------------------------------------------------------

const KMH = 22; // rough door-to-door average incl. stops / transfers

export interface MatchInfo {
  score: number; // 0..1
  travelMinutes: number;
  distanceKm: number;
  reasons: string[];
  belowDesiredRate: boolean;
}

export interface ShiftTravel {
  distanceKm: number;
  fastest: ModeEstimate;
  byMode: Record<TravelModeKey, ModeEstimate>;
}

export interface MarketplaceShift {
  id: string;
  title: string;
  description: string | null;
  branch: string;
  city: string;
  branchLat: number;
  branchLng: number;
  startsAt: Date;
  endsAt: Date;
  breakMinutes: number;
  hourlyRateCents: number;
  positions: number;
  taken: number;
  skill: string | null;
  grossCents: number;
  hours: number;
  daypart: "morning" | "afternoon" | "evening";
  weekday: number;
  match: MatchInfo | null;
  travel: ShiftTravel | null;
  workedHereBefore: number;
  /** part of a multi-day run posted by the employer */
  series: Series | null;
  /** this seat opened up because someone needs a replacement */
  isReplacement: boolean;
  replacementNote: string | null;
  /** the signed-in freelancer's own counter-offer on this shift, if any */
  myOffer: { proposedRateCents: number; status: OfferStatus } | null;
}

export interface MarketplaceData {
  canApply: boolean;
  blockReason: string | null;
  home: { lat: number; lng: number } | null;
  prefs: UserPrefs;
  shifts: MarketplaceShift[];
  newSinceLastVisit: number;
}

function daypartOf(d: Date): MarketplaceShift["daypart"] {
  const h = d.getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

function computeMatch(
  home: { lat: number; lng: number } | null,
  reliability: number,
  freelancerSkills: Set<string>,
  shift: { branchLat: number; branchLng: number; skill: string | null; hourlyRateCents: number },
  desiredRateCents: number | null,
): MatchInfo | null {
  if (!home) return null;
  const distanceMeters = haversineMeters(
    { latitude: home.lat, longitude: home.lng },
    { latitude: shift.branchLat, longitude: shift.branchLng },
  );
  const distanceKm = Math.round((distanceMeters / 1000) * 10) / 10;
  const travelMinutes = Math.max(1, Math.round((distanceKm / KMH) * 60));

  const travelScore = Math.max(0, 1 - travelMinutes / 75);
  const relScore = Math.min(1, Math.max(0, reliability));
  const skillScore = !shift.skill ? 0.6 : freelancerSkills.has(shift.skill) ? 1 : 0.3;

  const score = Math.round((0.4 * relScore + 0.35 * travelScore + 0.25 * skillScore) * 100) / 100;

  const reasons: string[] = [];
  reasons.push(`${travelMinutes} min reistijd`);
  if (shift.skill) reasons.push(freelancerSkills.has(shift.skill) ? "vakmatch hoog" : "buiten je vak");
  reasons.push(`betrouwbaarheid ${relScore.toFixed(2)}`);

  return {
    score,
    travelMinutes,
    distanceKm,
    reasons,
    belowDesiredRate: desiredRateCents != null && shift.hourlyRateCents < desiredRateCents,
  };
}

export function computeTravel(
  home: { lat: number; lng: number } | null,
  dest: { lat: number; lng: number },
): ShiftTravel | null {
  if (!home) return null;
  const meters = haversineMeters(
    { latitude: home.lat, longitude: home.lng },
    { latitude: dest.lat, longitude: dest.lng },
  );
  const byMode = travelByMode(meters);
  return {
    distanceKm: Math.round((meters / 1000) * 10) / 10,
    fastest: fastestMode(byMode),
    byMode,
  };
}

async function resolveFreelancer(userId: string) {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      kvkValid: true,
      isBlacklisted: true,
      matchingBlockedUntil: true,
      homeLatitude: true,
      homeLongitude: true,
      reliabilityScore: true,
      skills: { select: { skill: { select: { name: true } } } },
      user: { select: { kycStatus: true } },
    },
  });
  return profile;
}

export async function getMarketplace(userId: string): Promise<MarketplaceData> {
  const [profile, prefs] = await Promise.all([resolveFreelancer(userId), getPrefs(userId)]);

  const canApply =
    !!profile &&
    profile.user.kycStatus === "VERIFIED" &&
    profile.kvkValid &&
    !profile.isBlacklisted &&
    !(profile.matchingBlockedUntil && profile.matchingBlockedUntil.getTime() > Date.now());

  const blockReason = !profile
    ? "Rond eerst je verificatie af om diensten aan te nemen."
    : profile.user.kycStatus !== "VERIFIED" || !profile.kvkValid
      ? "Je kunt pas aannemen als je volledig geverifieerd bent."
      : profile.isBlacklisted
        ? "Je account kan momenteel geen diensten aannemen."
        : profile.matchingBlockedUntil && profile.matchingBlockedUntil.getTime() > Date.now()
          ? "Matching is tijdelijk beperkt vanwege Wet DBA-signalen."
          : null;

  const home =
    profile && Number.isFinite(profile.homeLatitude)
      ? { lat: profile.homeLatitude, lng: profile.homeLongitude }
      : null;
  const skills = new Set((profile?.skills ?? []).map((s) => s.skill.name));

  const takenShiftIds = profile
    ? (
        await prisma.shiftAssignment.findMany({
          where: { freelancerId: profile.id, cancelledAt: null },
          select: { shiftId: true },
        })
      ).map((a) => a.shiftId)
    : [];

  // Branches where this freelancer has worked before (for "je werkte hier al Nx").
  const priorByBranch = new Map<string, number>();
  if (profile) {
    const prior = await prisma.shiftAssignment.findMany({
      where: { freelancerId: profile.id },
      select: { shift: { select: { branchId: true } } },
    });
    for (const p of prior) {
      priorByBranch.set(p.shift.branchId, (priorByBranch.get(p.shift.branchId) ?? 0) + 1);
    }
  }

  const [openReplacements, myOffers] = await Promise.all([
    listReplacementRequests(300),
    offersForUser(userId),
  ]);
  const replacementByShift = new Map<string, string>();
  for (const r of openReplacements) {
    if (r.status === "open") replacementByShift.set(r.shiftId, r.note || `Vervanging voor ${r.freelancerName}`);
  }
  const offerByShift = new Map<string, { proposedRateCents: number; status: OfferStatus }>();
  for (const o of myOffers) {
    if (o.status !== "withdrawn") offerByShift.set(o.shiftId, { proposedRateCents: o.proposedRateCents, status: o.status });
  }

  const rows = await prisma.shift.findMany({
    where: {
      status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] },
      startsAt: { gte: new Date() },
      id: { notIn: takenShiftIds },
    },
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      endsAt: true,
      breakMinutes: true,
      hourlyRateCents: true,
      positions: true,
      createdAt: true,
      branchId: true,
      requiredSkill: { select: { name: true } },
      branch: { select: { name: true, city: true, latitude: true, longitude: true } },
      _count: { select: { assignments: { where: { cancelledAt: null } } } },
    },
    orderBy: { startsAt: "asc" },
    take: 60,
  });

  const lastSeen = prefs.marketplaceSeenAt ? new Date(prefs.marketplaceSeenAt).getTime() : 0;
  let newSinceLastVisit = 0;

  const visible = rows.filter((s) => s._count.assignments < s.positions || replacementByShift.has(s.id));
  const series = detectSeries(
    visible.map((s) => ({
      id: s.id,
      title: s.title,
      branchId: s.branchId,
      startsAt: s.startsAt,
      positions: s.positions,
      taken: s._count.assignments,
    })),
  );

  const shifts: MarketplaceShift[] = visible.map((s) => {
      const hours = (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000 - s.breakMinutes / 60;
      if (s.createdAt.getTime() > lastSeen) newSinceLastVisit += 1;
      return {
        id: s.id,
        title: s.title,
        description: s.description,
        branch: s.branch.name,
        city: s.branch.city,
        branchLat: s.branch.latitude,
        branchLng: s.branch.longitude,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        breakMinutes: s.breakMinutes,
        hourlyRateCents: s.hourlyRateCents,
        positions: s.positions,
        taken: s._count.assignments,
        skill: s.requiredSkill?.name ?? null,
        grossCents: Math.round(Math.max(0, hours) * s.hourlyRateCents),
        hours: Math.round(Math.max(0, hours) * 10) / 10,
        daypart: daypartOf(s.startsAt),
        weekday: s.startsAt.getDay(),
        workedHereBefore: priorByBranch.get(s.branchId) ?? 0,
        travel: computeTravel(home, { lat: s.branch.latitude, lng: s.branch.longitude }),
        series: series.get(s.id) ?? null,
        isReplacement: replacementByShift.has(s.id),
        replacementNote: replacementByShift.get(s.id) ?? null,
        myOffer: offerByShift.get(s.id) ?? null,
        match: computeMatch(
          home,
          profile?.reliabilityScore ?? 0.7,
          skills,
          { branchLat: s.branch.latitude, branchLng: s.branch.longitude, skill: s.requiredSkill?.name ?? null, hourlyRateCents: s.hourlyRateCents },
          prefs.desiredHourlyRateCents,
        ),
      };
    });

  return { canApply, blockReason, home, prefs, shifts, newSinceLastVisit };
}

export interface AgreementSummary {
  id: string;
  reference: string;
  type: string;
  status: string;
  templateKey: string;
  freelancerSigned: boolean;
  clientSigned: boolean;
  hourlyRateCents: number | null;
}

export interface ShiftDetail extends MarketplaceShift {
  address: string;
  postalCode: string;
  geofenceRadiusMeters: number;
  canApply: boolean;
  blockReason: string | null;
  alreadyApplied: boolean;
  /** existing model agreement with this client, or a preview of what will be created */
  agreement: AgreementSummary | null;
  agreementType: string;
  /** the client organisation behind this branch (for reviews / contact) */
  clientTenantId: string;
  clientName: string;
  /** full multi-day series (all days, incl. ones you already took) */
  seriesDays: { shiftId: string; date: string; weekday: string; seatsFree: number; mine: boolean }[];
}

export async function getShiftDetail(userId: string, shiftId: string): Promise<ShiftDetail | null> {
  const market = await getMarketplace(userId);
  const inList = market.shifts.find((s) => s.id === shiftId);

  const row = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      endsAt: true,
      breakMinutes: true,
      hourlyRateCents: true,
      positions: true,
      branchId: true,
      requiredSkill: { select: { name: true } },
      branch: {
        select: {
          name: true,
          city: true,
          latitude: true,
          longitude: true,
          addressLine: true,
          postalCode: true,
          geofenceRadiusMeters: true,
          tenantId: true,
          matchingConfig: true,
        },
      },
      _count: { select: { assignments: { where: { cancelledAt: null } } } },
    },
  });
  if (!row) return null;

  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { id: true, homeLatitude: true, homeLongitude: true },
  });
  const detailHome =
    profile && Number.isFinite(profile.homeLatitude)
      ? { lat: profile.homeLatitude, lng: profile.homeLongitude }
      : null;
  const alreadyApplied = profile
    ? Boolean(
        await prisma.shiftAssignment.findUnique({
          where: { shiftId_freelancerId: { shiftId, freelancerId: profile.id } },
          select: { id: true },
        }),
      )
    : false;

  // Existing model agreement between this freelancer and this client, if any.
  const agreementRow = profile
    ? await prisma.modelAgreement.findFirst({
        where: { freelancerId: profile.id, tenantId: row.branch.tenantId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          reference: true,
          type: true,
          status: true,
          templateKey: true,
          freelancerSignedAt: true,
          clientSignedAt: true,
          hourlyRateCents: true,
        },
      })
    : null;
  const agreement: AgreementSummary | null = agreementRow
    ? {
        id: agreementRow.id,
        reference: agreementRow.reference,
        type: agreementRow.type,
        status: agreementRow.status,
        templateKey: agreementRow.templateKey,
        freelancerSigned: Boolean(agreementRow.freelancerSignedAt),
        clientSigned: Boolean(agreementRow.clientSignedAt),
        hourlyRateCents: agreementRow.hourlyRateCents,
      }
    : null;

  // Full multi-day series for this job at this branch (all open shifts + mine).
  const mine = profile
    ? new Set(
        (
          await prisma.shiftAssignment.findMany({
            where: { freelancerId: profile.id, cancelledAt: null },
            select: { shiftId: true },
          })
        ).map((a) => a.shiftId),
      )
    : new Set<string>();
  const hh = row.startsAt.getHours();
  const dayStart = new Date(row.startsAt);
  dayStart.setDate(dayStart.getDate() - 14);
  const dayEnd = new Date(row.startsAt);
  dayEnd.setDate(dayEnd.getDate() + 21);
  const seriesRows = await prisma.shift.findMany({
    where: {
      branchId: row.branchId,
      title: row.title,
      startsAt: { gte: dayStart, lte: dayEnd },
      status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED", "FILLED"] },
    },
    select: {
      id: true,
      startsAt: true,
      positions: true,
      _count: { select: { assignments: { where: { cancelledAt: null } } } },
    },
    orderBy: { startsAt: "asc" },
  });
  const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  const seriesDays = seriesRows
    .filter((r) => r.startsAt.getHours() === hh)
    .map((r) => ({
      shiftId: r.id,
      date: r.startsAt.toISOString().slice(0, 10),
      weekday: WD[r.startsAt.getDay()] ?? "",
      seatsFree: Math.max(0, r.positions - r._count.assignments),
      mine: mine.has(r.id),
    }));

  const detailHours =
    (row.endsAt.getTime() - row.startsAt.getTime()) / 3_600_000 - row.breakMinutes / 60;
  const base =
    inList ??
    ({
      id: row.id,
      title: row.title,
      description: row.description,
      branch: row.branch.name,
      city: row.branch.city,
      branchLat: row.branch.latitude,
      branchLng: row.branch.longitude,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      breakMinutes: row.breakMinutes,
      hourlyRateCents: row.hourlyRateCents,
      positions: row.positions,
      taken: row._count.assignments,
      skill: row.requiredSkill?.name ?? null,
      grossCents: Math.round(Math.max(0, detailHours) * row.hourlyRateCents),
      hours: Math.round(Math.max(0, detailHours) * 10) / 10,
      daypart: daypartOf(row.startsAt),
      weekday: row.startsAt.getDay(),
      match: null,
      travel: computeTravel(detailHome, { lat: row.branch.latitude, lng: row.branch.longitude }),
      workedHereBefore: 0,
      series: null,
      isReplacement: false,
      replacementNote: null,
      myOffer: null,
    } satisfies MarketplaceShift);

  const agreementType =
    typeof (row.branch.matchingConfig as { agreementType?: string })?.agreementType === "string"
      ? (row.branch.matchingConfig as { agreementType: string }).agreementType
      : "VRIJE_VERVANGING";

  return {
    ...base,
    address: row.branch.addressLine,
    postalCode: row.branch.postalCode,
    geofenceRadiusMeters: row.branch.geofenceRadiusMeters,
    canApply: market.canApply,
    blockReason: market.blockReason,
    alreadyApplied,
    agreement,
    agreementType,
    clientTenantId: row.branch.tenantId,
    clientName: row.branch.name,
    seriesDays: seriesDays.length > 1 ? seriesDays : [],
  };
}
