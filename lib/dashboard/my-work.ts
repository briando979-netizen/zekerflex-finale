import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/prefs/store";
import { listReplacementRequests } from "@/lib/replacements/store";
import { offersForUser } from "@/lib/offers/store";
import { healAcceptedOffer } from "@/lib/matching/heal";
import { computeTravel, type MarketplaceShift } from "@/lib/dashboard/marketplace";
import { amsterdamParts } from "@/lib/time/amsterdam";
import { overlapsAny } from "@/lib/shifts/worker-overlap";
import { REACTIE_MARGE_MS, reactieVervalt } from "@/lib/offers/verval";
import { isTestklus } from "@/lib/shifts/testklus";

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
  | "hours" // afgelopen: urenbriefje in te vullen of ingediend, nog niet goedgekeurd
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
  /** stable identity for dismissing a card (see dismissWorkItem) */
  workKey: string;
  shift: MarketplaceShift;
  assignmentId: string | null;
  status: WorkStatus;
  confirmedAt: string | null;
  replacementRequested: boolean;
  replacementRequestId: string | null;
  replacementResponseCount: number;
  agreement: AgreementLite | null;
  timesheetStatus: string | null;
  timesheetId: string | null;
  clientTenantId: string | null;
  clientName: string | null;
  offerRateCents: number | null;
  offerStatusLabel: string | null;
  /**
   * Waarom een item in het archief "rejected" is: tegenbod afgewezen, niet gekozen,
   * of verlopen (de klus begon zonder keuze, lib/offers/verval.ts). Null bij andere statussen.
   */
  rejectedKind: "counter" | "notChosen" | "expired" | null;
  /** employer cancelled this after you were assigned → you may file a 50% claim */
  cancelledByEmployer: boolean;
}

export interface MyWork {
  pending: MyWorkItem[];
  active: MyWorkItem[];
  /** afgelopen klussen waarvan de uren nog ingevuld/goedgekeurd moeten worden */
  hours: MyWorkItem[];
  history: MyWorkItem[];
  /** niet uitgekozen (afgewezen, verlopen of nooit gekozen): onder "In afwachting", niet in het archief */
  notChosen: MyWorkItem[];
}

const WD_DAYPART = (d: Date): MarketplaceShift["daypart"] => {
  const h = amsterdamParts(d).hour; // Dutch wall-clock: the server runs in UTC
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
  viaUitzendbureau: boolean;
  requiredSkill: { name: string } | null;
  branch: { name: string; city: string; latitude: number; longitude: number; tenant: { id: string; name: string } };
  _count: { assignments: number };
};

export function toShift(row: ShiftRow, home: { lat: number; lng: number } | null): MarketplaceShift {
  const hours = (row.endsAt.getTime() - row.startsAt.getTime()) / 3_600_000 - row.breakMinutes / 60;
  return {
    // Fast payout is shown on the klus page / at hours-entry, which look it up per client.
    fastPay: false,
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
    weekday: amsterdamParts(row.startsAt).weekday,
    match: null,
    travel: computeTravel(home, { lat: row.branch.latitude, lng: row.branch.longitude }),
    workedHereBefore: 0,
    followed: false,
    series: null,
    isReplacement: false,
    replacementNote: null,
    myOffer: null,
    viaUitzendbureau: row.viaUitzendbureau,
    testklus: isTestklus({ title: row.title, bedrijf: row.branch.tenant.name }),
  };
}

const OFFER_LABEL: Record<string, string> = {
  pending: "In afwachting",
  accepted: "Geaccepteerd",
  declined: "Afgewezen",
  expired: "Niet uitgekozen",
};

export const SHIFT_SELECT = {
  id: true,
  title: true,
  description: true,
  startsAt: true,
  endsAt: true,
  breakMinutes: true,
  hourlyRateCents: true,
  positions: true,
  branchId: true,
  viaUitzendbureau: true,
  status: true,
  requiredSkill: { select: { name: true } },
  branch: { select: { name: true, city: true, latitude: true, longitude: true, tenant: { select: { id: true, name: true } } } },
  _count: { select: { assignments: { where: { cancelledAt: null } } } },
} as const;

export async function getMyWork(userId: string): Promise<MyWork> {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { id: true, homeLatitude: true, homeLongitude: true },
  });
  if (!profile) return { pending: [], active: [], hours: [], history: [], notChosen: [] };

  const home = Number.isFinite(profile.homeLatitude)
    ? { lat: profile.homeLatitude, lng: profile.homeLongitude }
    : null;

  const assignmentQuery = {
    where: { freelancerId: profile.id },
    select: {
      id: true,
      acceptedAt: true,
      cancelledAt: true,
      cancelReason: true,
      shift: { select: SHIFT_SELECT },
      timesheet: { select: { id: true, status: true } },
    },
    orderBy: { shift: { startsAt: "desc" } },
    take: 60,
  } as const;

  const [prefs, replacements, offers, assignments0, agreements] = await Promise.all([
    getPrefs(userId),
    listReplacementRequests(300),
    offersForUser(userId),
    prisma.shiftAssignment.findMany(assignmentQuery),
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

  // Heal: een geaccepteerde reactie bij een geverifieerd bedrijf hoort een echte
  // toewijzing te hebben. Zo niet, maken we 'm alsnog (idempotent) zodat de klus
  // volledig te beheren is — daarna verschijnen de actieknoppen op de kaart.
  let assignments = assignments0;
  {
    const assignedIds = new Set(assignments.filter((a) => !a.cancelledAt).map((a) => a.shift.id));
    const orphans = offers.filter((o) => o.status === "accepted" && !assignedIds.has(o.shiftId));
    if (orphans.length) {
      const results = await Promise.all(orphans.map((o) => healAcceptedOffer(userId, profile.id, o.shiftId).catch(() => null)));
      if (results.some(Boolean)) assignments = await prisma.shiftAssignment.findMany(assignmentQuery);
    }
  }

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
  const replacementByAssignment = new Map(
    replacements
      .filter((r) => r.userId === userId && r.status === "open")
      .map((r) => [r.assignmentId, r] as const),
  );

  const now = Date.now();
  const pending: MyWorkItem[] = [];
  const active: MyWorkItem[] = [];
  const hours: MyWorkItem[] = [];
  const history: MyWorkItem[] = [];
  const nietGekozen: MyWorkItem[] = [];

  // ── counter-offers ──────────────────────────────────────────────────
  // A live assignment is always the authoritative, current state of a klus
  // for this freelancer — once one exists for a shift, any offer/counter-offer
  // record for that same shift is history that already did its job (it led to
  // the assignment, or was superseded by a later one) and must not ALSO
  // surface as a separate card, or the same klus shows up under two tabs at
  // once. This set also catches the one case a live assignment can't cover:
  // an accepted offer that, for whatever reason, never got a real assignment
  // row, so it still shows up (under "Uitgekozen", matching its real status)
  // instead of silently vanishing.
  const assignedShiftIds = new Set(
    assignments.filter((a) => !a.cancelledAt).map((a) => a.shift.id),
  );
  const offerShiftIds = offers
    .filter((o) => o.status !== "withdrawn" && !assignedShiftIds.has(o.shiftId))
    .map((o) => o.shiftId);
  const offerShifts = offerShiftIds.length
    ? await prisma.shift.findMany({ where: { id: { in: offerShiftIds } }, select: SHIFT_SELECT })
    : [];
  const offerShiftById = new Map(offerShifts.map((s) => [s.id, s]));
  for (const o of offers) {
    if (o.status === "withdrawn" || assignedShiftIds.has(o.shiftId)) continue;
    const row = offerShiftById.get(o.shiftId);
    if (!row) continue;
    const over = row.endsAt.getTime() < now;
    const shift = toShift(row, home);
    // Een reactie waar niet op gekozen werd terwijl de klus al begon (of geannuleerd is)
    // telt als niet uitgekozen, ook vóór de opruimronde (lib/offers/expire.ts) hem omzet.
    const status = o.status === "pending" && reactieVervalt(row, now) ? "expired" : o.status;
    shift.myOffer = { proposedRateCents: o.proposedRateCents, status };
    const rejectedKind: MyWorkItem["rejectedKind"] =
      status === "expired" ? "expired" : status === "declined" ? (o.proposedRateCents !== o.listedRateCents ? "counter" : "notChosen") : null;
    const item: MyWorkItem = {
      workKey: `o:${o.id}`,
      shift,
      assignmentId: null,
      // Voorbije geaccepteerde reactie → archief, niet meer onder "Uitgekozen".
      status: status === "pending" ? "pending" : status === "accepted" ? (over ? "done" : "active") : "rejected",
      confirmedAt: null,
      replacementRequested: false,
      replacementRequestId: null,
      replacementResponseCount: 0,
      agreement: agreementByShift.get(o.shiftId) ?? null,
      timesheetStatus: null,
      timesheetId: null,
      clientTenantId: null,
      clientName: null,
      offerRateCents: o.proposedRateCents,
      offerStatusLabel: OFFER_LABEL[status] ?? status,
      rejectedKind,
      cancelledByEmployer: false,
    };
    // Each item lands in exactly the one bucket that matches its own status —
    // an "active" (accepted) item belongs under Uitgekozen, never Pending.
    if (item.status === "pending") pending.push(item);
    else if (item.status === "active") active.push(item);
    else if (item.status === "rejected") nietGekozen.push(item); // onder "In afwachting", te verbergen
    else history.push(item); // voorbij ("done")
  }

  // ── accepted assignments ────────────────────────────────────────────
  // A klus is "Uitgekozen" until it is over (also while it's under way). Once
  // over, while its hours are still a draft it lives only on "Uren invullen";
  // after the hours are handed in it moves to "Gearchiveerd".
  for (const a of assignments) {
    const shift = toShift(a.shift as ShiftRow, home);
    const over = a.shift.endsAt.getTime() < now;
    // Een vervangingsverzoek telt alleen tot de klus begint; daarna gewoon uren of archief
    // (anders bleef de klus voor altijd onder "Uitgekozen" hangen zonder uren in te vullen).
    const repl = a.shift.startsAt.getTime() > now ? replacementByAssignment.get(a.id) : undefined;
    const isReplacement = Boolean(repl);
    const ts = a.timesheet?.status ?? null;
    // Afgelopen klus met nog in te vullen of ingediende (nog niet goedgekeurde)
    // uren → "Uren"-bucket. Die blijft daar (ook met status "ingediend") tot de
    // opdrachtgever goedkeurt; dan valt het in "done" en gaat naar het archief.
    const needsHours = over && !a.cancelledAt && !isReplacement && (ts === "DRAFT" || ts === "SUBMITTED" || ts === "DISPUTED");
    const item: MyWorkItem = {
      workKey: `a:${a.id}`,
      shift,
      assignmentId: a.id,
      status: a.cancelledAt ? "cancelled" : isReplacement ? "replacement" : !over ? "active" : needsHours ? "hours" : "done",
      confirmedAt: prefs.confirmations[a.id] ?? null,
      replacementRequested: isReplacement,
      replacementRequestId: repl?.id ?? null,
      replacementResponseCount: repl?.responses.length ?? 0,
      agreement: agreementByShift.get(a.shift.id) ?? null,
      timesheetStatus: a.timesheet?.status ?? null,
      timesheetId: a.timesheet?.id ?? null,
      clientTenantId: a.shift.branch.tenant.id,
      clientName: a.shift.branch.tenant.name,
      offerRateCents: null,
      offerStatusLabel: null,
      rejectedKind: null,
      cancelledByEmployer: Boolean(
        a.cancelledAt && (a.cancelReason ?? "").toLowerCase().includes("opdrachtgever"),
      ),
    };
    if (item.status === "active" || item.status === "replacement") active.push(item);
    else if (item.status === "hours") hours.push(item);
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
    select: { id: true, shift: { select: SHIFT_SELECT }, expiresAt: true },
    take: 20,
  });
  const pendingShiftIds = new Set(pending.map((p) => p.shift.id));
  for (const m of openMatches) {
    if (pendingShiftIds.has(m.shift.id)) continue;
    pending.push({
      workKey: `m:${m.id}`,
      shift: toShift(m.shift as ShiftRow, home),
      assignmentId: null,
      status: "pending",
      confirmedAt: null,
      replacementRequested: false,
      replacementRequestId: null,
      replacementResponseCount: 0,
      agreement: null,
      timesheetStatus: null,
      timesheetId: null,
      clientTenantId: null,
      clientName: null,
      offerRateCents: null,
      offerStatusLabel: "Aanbod ontvangen",
      rejectedKind: null,
      cancelledByEmployer: false,
    });
  }

  // ── matched but not chosen ("Niet uitgekozen") ──────────────────────────
  // The matching engine notifies several candidates per shift (lib/matching/
  // engine.ts) and the dispatcher marks a match DECLINED (freelancer said no)
  // or EXPIRED (window passed / someone else got the seat) — but nothing ever
  // surfaced that to the freelancer: it just silently disappeared from
  // "In afwachting" with no trace anywhere. The "Niet uitgekozen" label
  // already existed in HistoryFooter but was unreachable dead code because no
  // item was ever built with offerRateCents: null + status "rejected" from
  // this source.
  const coveredShiftIds = new Set([...assignedShiftIds, ...offerShiftIds, ...pendingShiftIds]);
  // Ook een aanbod waar je nooit op reageerde en waarvan de klus al begon: anders
  // verdween het spoorloos uit "In afwachting" (alleen weergave; de match zelf blijft).
  const notChosen = await prisma.shiftMatch.findMany({
    where: {
      freelancerId: profile.id,
      shiftId: { notIn: [...coveredShiftIds] },
      OR: [
        { status: { in: ["DECLINED", "EXPIRED"] } },
        { status: { in: ["NOTIFIED", "VIEWED"] }, respondedAt: null, shift: { startsAt: { lt: new Date(now - REACTIE_MARGE_MS) } } },
      ],
    },
    select: { id: true, shift: { select: SHIFT_SELECT }, respondedAt: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  for (const m of notChosen) {
    nietGekozen.push({
      workKey: `nm:${m.id}`,
      shift: toShift(m.shift as ShiftRow, home),
      assignmentId: null,
      status: "rejected",
      confirmedAt: null,
      replacementRequested: false,
      replacementRequestId: null,
      replacementResponseCount: 0,
      agreement: null,
      timesheetStatus: null,
      timesheetId: null,
      clientTenantId: null,
      clientName: null,
      offerRateCents: null,
      offerStatusLabel: null,
      rejectedKind: "notChosen",
      cancelledByEmployer: false,
    });
  }

  active.sort((a, b) => a.shift.startsAt.getTime() - b.shift.startsAt.getTime());

  // Dubbel ingepland (geboekt vóór de controle in lib/shifts/worker-overlap.ts):
  // markeer beide, zodat de werker er één afzegt in plaats van niet te komen.
  const booked = active.filter((i) => i.assignmentId && i.status === "active");
  for (const i of booked) {
    const others = booked.filter((o) => o.shift.id !== i.shift.id).map((o) => o.shift);
    if (overlapsAny(others, i.shift)) i.shift.busy = true;
  }

  // Uren-bucket: nog in te vullen (DRAFT) bovenaan, daarna ingediend/in dispuut.
  hours.sort((a, b) => {
    const rank = (x: MyWorkItem) => (x.timesheetStatus === "DRAFT" ? 0 : 1);
    return rank(a) - rank(b) || b.shift.startsAt.getTime() - a.shift.startsAt.getTime();
  });
  const prefsDismissed = new Set(prefs.dismissedWorkItemIds);
  return {
    pending,
    active,
    hours,
    history: history.filter((item) => !prefsDismissed.has(item.workKey)),
    notChosen: nietGekozen.filter((item) => !prefsDismissed.has(item.workKey)),
  };
}
