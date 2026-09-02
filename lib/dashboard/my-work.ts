import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/prefs/store";
import { listReplacementRequests } from "@/lib/replacements/store";
import { offersForUser } from "@/lib/offers/store";
import { computeTravel, type MarketplaceShift } from "@/lib/dashboard/marketplace";

// ---------------------------------------------------------------------------
// "Mijn klussen" — the freelancer's own engagements in three buckets:
//   pending  → counter-offers awaiting a reply + offered matches not yet taken
//   active   → accepted, upcoming ("geactiveerd")
//   history  → done / cancelled / not chosen ("niet uitgekozen")
// Uses the same MarketplaceShift shape so /dashboard/diensten reuses ShiftCard.
// DB is read-only; pending/replacement state lives on the filesystem.
// ---------------------------------------------------------------------------

export type WorkStatus =
  | "pending" // counter-offer or offer awaiting a reply
  | "active" // accepted, upcoming
  | "replacement" // you asked for a substitute
  | "done"
  | "cancelled"
  | "rejected"; // offer declined / not chosen

export interface AgreementLite {
  reference: string;
  type: string;
  status: string;
  freelancerSigned: boolean;
  clientSigned: boolean;
}

export interface MyWorkItem {
  shift: MarketplaceShift;
  assignmentId: string | null;
  status: WorkStatus;
  confirmedAt: string | null;
  replacementRequested: boolean;
  agreement: AgreementLite | null;
  timesheetStatus: string | null;
  offerRateCents: number | null;
  offerStatusLabel: string | null;
  /** employer cancelled this after you were assigned → you may file a 50% claim */
  cancelledByEmployer: boolean;
}

export interface MyWork {
  pending: MyWorkItem[];
  active: MyWorkItem[];
  history: MyWorkItem[];
}

const WD_DAYPART = (d: Date): MarketplaceShift["daypart"] => {
  const h = d.getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
};

type ShiftRow = {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  breakMinutes: number;
  hourlyRateCents: number;
  positions: number;
  branchId: string;
  requiredSkill: { name: string } | null;
  branch: { name: string; city: string; latitude: number; longitude: number };
  _count: { assignments: number };
};

function toShift(row: ShiftRow, home: { lat: number; lng: number } | null): MarketplaceShift {
  const hours = (row.endsAt.getTime() - row.startsAt.getTime()) / 3_600_000 - row.breakMinutes / 60;
  return {
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
    grossCents: Math.round(Math.max(0, hours) * row.hourlyRateCents),
    hours: Math.round(Math.max(0, hours) * 10) / 10,
    daypart: WD_DAYPART(row.startsAt),
    weekday: row.startsAt.getDay(),
    match: null,
    travel: computeTravel(home, { lat: row.branch.latitude, lng: row.branch.longitude }),
    workedHereBefore: 0,
    series: null,
    isReplacement: false,
    replacementNote: null,
    myOffer: null,
  };
}

const OFFER_LABEL: Record<string, string> = {
  pending: "In afwachting",
  accepted: "Geaccepteerd",
  declined: "Afgewezen",
};

const SHIFT_SELECT = {
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
  branch: { select: { name: true, city: true, latitude: true, longitude: true } },
  _count: { select: { assignments: { where: { cancelledAt: null } } } },
} as const;

export async function getMyWork(userId: string): Promise<MyWork> {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { id: true, homeLatitude: true, homeLongitude: true },
  });
  if (!profile) return { pending: [], active: [], history: [] };

  const home = Number.isFinite(profile.homeLatitude)
    ? { lat: profile.homeLatitude, lng: profile.homeLongitude }
    : null;

  const [prefs, replacements, offers, assignments, agreements] = await Promise.all([
    getPrefs(userId),
    listReplacementRequests(300),
    offersForUser(userId),
    prisma.shiftAssignment.findMany({
      where: { freelancerId: profile.id },
      select: {
        id: true,
        acceptedAt: true,
        cancelledAt: true,
        cancelReason: true,
        shift: { select: SHIFT_SELECT },
        timesheet: { select: { status: true } },
      },
      orderBy: { shift: { startsAt: "desc" } },
      take: 60,
    }),
    prisma.modelAgreement.findMany({
      where: { freelancerId: profile.id },
      select: {
        shiftId: true,
        tenantId: true,
        reference: true,
        type: true,
        status: true,
        freelancerSignedAt: true,
        clientSignedAt: true,
      },
    }),
  ]);

  const agreementByShift = new Map<string, AgreementLite>();
  for (const a of agreements) {
    if (!a.shiftId) continue;
    agreementByShift.set(a.shiftId, {
      reference: a.reference,
      type: a.type,
      status: a.status,
      freelancerSigned: Boolean(a.freelancerSignedAt),
      clientSigned: Boolean(a.clientSignedAt),
    });
  }
  const replacementByAssignment = new Set(
    replacements.filter((r) => r.userId === userId && r.status === "open").map((r) => r.assignmentId),
  );

  const now = Date.now();
  const pending: MyWorkItem[] = [];
  const active: MyWorkItem[] = [];
  const history: MyWorkItem[] = [];

  // ── counter-offers ──────────────────────────────────────────────────
  const offerShiftIds = offers.filter((o) => o.status !== "withdrawn").map((o) => o.shiftId);
  const offerShifts = offerShiftIds.length
    ? await prisma.shift.findMany({ where: { id: { in: offerShiftIds } }, select: SHIFT_SELECT })
    : [];
  const offerShiftById = new Map(offerShifts.map((s) => [s.id, s]));
  for (const o of offers) {
    if (o.status === "withdrawn") continue;
    const row = offerShiftById.get(o.shiftId);
    if (!row) continue;
    const shift = toShift(row, home);
    shift.myOffer = { proposedRateCents: o.proposedRateCents, status: o.status };
    const item: MyWorkItem = {
      shift,
      assignmentId: null,
      status: o.status === "pending" ? "pending" : o.status === "accepted" ? "active" : "rejected",
      confirmedAt: null,
      replacementRequested: false,
      agreement: agreementByShift.get(o.shiftId) ?? null,
      timesheetStatus: null,
      offerRateCents: o.proposedRateCents,
      offerStatusLabel: OFFER_LABEL[o.status] ?? o.status,
      cancelledByEmployer: false,
    };
    if (item.status === "pending") pending.push(item);
    else if (item.status === "rejected") history.push(item);
  }

  // ── accepted assignments ────────────────────────────────────────────
  for (const a of assignments) {
    const shift = toShift(a.shift as ShiftRow, home);
    const isReplacement = replacementByAssignment.has(a.id);
    const item: MyWorkItem = {
      shift,
      assignmentId: a.id,
      status: a.cancelledAt
        ? "cancelled"
        : isReplacement
          ? "replacement"
          : a.shift.startsAt.getTime() >= now
            ? "active"
            : "done",
      confirmedAt: prefs.confirmations[a.id] ?? null,
      replacementRequested: isReplacement,
      agreement: agreementByShift.get(a.shift.id) ?? null,
      timesheetStatus: a.timesheet?.status ?? null,
      offerRateCents: null,
      offerStatusLabel: null,
      cancelledByEmployer: Boolean(
        a.cancelledAt && (a.cancelReason ?? "").toLowerCase().includes("opdrachtgever"),
      ),
    };
    if (item.status === "active" || item.status === "replacement") active.push(item);
    else history.push(item);
  }

  // ── offered matches not yet acted on (dispatcher offers) ─────────────
  const openMatches = await prisma.shiftMatch.findMany({
    where: {
      freelancerId: profile.id,
      status: { in: ["NOTIFIED", "VIEWED"] },
      respondedAt: null,
      shift: { startsAt: { gte: new Date() } },
    },
    select: { shift: { select: SHIFT_SELECT }, expiresAt: true },
    take: 20,
  });
  const pendingShiftIds = new Set(pending.map((p) => p.shift.id));
  for (const m of openMatches) {
    if (pendingShiftIds.has(m.shift.id)) continue;
    pending.push({
      shift: toShift(m.shift as ShiftRow, home),
      assignmentId: null,
      status: "pending",
      confirmedAt: null,
      replacementRequested: false,
      agreement: null,
      timesheetStatus: null,
      offerRateCents: null,
      offerStatusLabel: "Aanbod ontvangen",
      cancelledByEmployer: false,
    });
  }

  active.sort((a, b) => a.shift.startsAt.getTime() - b.shift.startsAt.getTime());
  return { pending, active, history };
}
