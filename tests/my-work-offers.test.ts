import { afterEach, describe, expect, it, vi } from "vitest";

// An accepted tegenbod computed status "active" but the push logic only
// checked for "pending"/"rejected" — so it landed in none of the three
// buckets and silently vanished from "Mijn klussen" ("het verdwijnt").
// Now: it still shows (as "Geaccepteerd"), under the SAME tab its status
// says it belongs in ("Uitgekozen", not "In afwachting" — tabs must only
// ever show their own category, never another tab's cards), unless a real
// assignment for that shift already represents it, to avoid showing the
// same shift twice (once from the stale offer, once from the live
// assignment) once accepting an offer finalises a real assignment.

const freelancerProfileFindUnique = vi.fn();
const shiftAssignmentFindMany = vi.fn();
const modelAgreementFindMany = vi.fn();
const shiftFindMany = vi.fn();
const shiftMatchFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: (...a: unknown[]) => freelancerProfileFindUnique(...a) },
    shiftAssignment: { findMany: (...a: unknown[]) => shiftAssignmentFindMany(...a) },
    modelAgreement: { findMany: (...a: unknown[]) => modelAgreementFindMany(...a) },
    shift: { findMany: (...a: unknown[]) => shiftFindMany(...a) },
    shiftMatch: { findMany: (...a: unknown[]) => shiftMatchFindMany(...a) },
  },
}));

const getPrefs = vi.fn().mockResolvedValue({ confirmations: {}, dismissedWorkItemIds: [] });
vi.mock("@/lib/prefs/store", () => ({
  getPrefs: (...a: unknown[]) => getPrefs(...a),
}));
vi.mock("@/lib/replacements/store", () => ({
  listReplacementRequests: vi.fn().mockResolvedValue([]),
}));

const offersForUser = vi.fn();
vi.mock("@/lib/offers/store", () => ({ offersForUser: (...a: unknown[]) => offersForUser(...a) }));

import { getMyWork } from "@/lib/dashboard/my-work";

function shiftRow(id: string, title: string) {
  return {
    id,
    title,
    description: null,
    startsAt: new Date(Date.now() + 86_400_000),
    endsAt: new Date(Date.now() + 90_000_000),
    breakMinutes: 0,
    hourlyRateCents: 1500,
    positions: 1,
    branchId: "branch1",
    requiredSkill: null,
    branch: { name: "Branch 1", city: "Rotterdam", latitude: 51.9, longitude: 4.5, tenant: { id: "org1", name: "Client" } },
    _count: { assignments: 0 },
  };
}

function acceptedOffer(shiftId: string) {
  return {
    id: `offer-${shiftId}`,
    at: new Date().toISOString(),
    userId: "u1",
    freelancerName: "Jan",
    shiftId,
    shiftTitle: "Klus",
    branch: "Branch 1",
    listedRateCents: 1500,
    proposedRateCents: 1800,
    note: "",
    status: "accepted" as const,
    respondedAt: new Date().toISOString(),
  };
}

afterEach(() => vi.clearAllMocks());

describe("getMyWork — accepted offers", () => {
  it("still shows an accepted offer with no real assignment yet, under Uitgekozen (not Pending)", async () => {
    freelancerProfileFindUnique.mockResolvedValue({ id: "fp1", homeLatitude: NaN, homeLongitude: NaN });
    shiftAssignmentFindMany.mockResolvedValue([]);
    modelAgreementFindMany.mockResolvedValue([]);
    shiftMatchFindMany.mockResolvedValue([]);
    offersForUser.mockResolvedValue([acceptedOffer("shiftA")]);
    shiftFindMany.mockResolvedValue([shiftRow("shiftA", "Klus A")]);

    const work = await getMyWork("u1");

    expect(work.active.map((i) => i.shift.id)).toContain("shiftA");
    expect(work.active.find((i) => i.shift.id === "shiftA")?.offerStatusLabel).toBe("Geaccepteerd");
    expect(work.pending).toHaveLength(0);
    expect(work.history).toHaveLength(0);
  });

  it("does not duplicate a shift that already has a real assignment", async () => {
    freelancerProfileFindUnique.mockResolvedValue({ id: "fp1", homeLatitude: NaN, homeLongitude: NaN });
    shiftAssignmentFindMany.mockResolvedValue([
      {
        id: "asg1",
        acceptedAt: new Date(),
        cancelledAt: null,
        cancelReason: null,
        shift: shiftRow("shiftB", "Klus B"),
        timesheet: null,
      },
    ]);
    modelAgreementFindMany.mockResolvedValue([]);
    shiftMatchFindMany.mockResolvedValue([]);
    offersForUser.mockResolvedValue([acceptedOffer("shiftB")]);
    shiftFindMany.mockResolvedValue([shiftRow("shiftB", "Klus B")]);

    const work = await getMyWork("u1");

    expect(work.pending.map((i) => i.shift.id)).not.toContain("shiftB");
    expect(work.active.map((i) => i.shift.id)).toContain("shiftB");
    expect(work.active).toHaveLength(1);
  });

  it("shows a shift exactly once when a stale rejected offer and a live assignment both exist", async () => {
    // A rejected/old counter-offer for a shift that was later (re-)assigned
    // for real must not ALSO show up as a separate "Gearchiveerd" card next
    // to the live assignment's own "Uitgekozen" card — the live assignment
    // is the one authoritative, current card for that shift.
    freelancerProfileFindUnique.mockResolvedValue({ id: "fp1", homeLatitude: NaN, homeLongitude: NaN });
    shiftAssignmentFindMany.mockResolvedValue([
      {
        id: "asg1",
        acceptedAt: new Date(),
        cancelledAt: null,
        cancelReason: null,
        shift: shiftRow("shiftC", "Klus C"),
        timesheet: null,
      },
    ]);
    modelAgreementFindMany.mockResolvedValue([]);
    shiftMatchFindMany.mockResolvedValue([]);
    offersForUser.mockResolvedValue([{ ...acceptedOffer("shiftC"), status: "rejected" as const }]);
    shiftFindMany.mockResolvedValue([shiftRow("shiftC", "Klus C")]);

    const work = await getMyWork("u1");

    const allIds = [...work.pending, ...work.active, ...work.history].filter((i) => i.shift.id === "shiftC");
    expect(allIds).toHaveLength(1);
    expect(work.active.map((i) => i.shift.id)).toContain("shiftC");
  });
});

describe("getMyWork — matched but not chosen", () => {
  it("surfaces a DECLINED/EXPIRED match as a 'Niet uitgekozen' card under In afwachting, not in the archive", async () => {
    freelancerProfileFindUnique.mockResolvedValue({ id: "fp1", homeLatitude: NaN, homeLongitude: NaN });
    shiftAssignmentFindMany.mockResolvedValue([]);
    modelAgreementFindMany.mockResolvedValue([]);
    offersForUser.mockResolvedValue([]);
    shiftFindMany.mockResolvedValue([]);
    shiftMatchFindMany
      .mockResolvedValueOnce([]) // the "pending open matches" query
      .mockResolvedValueOnce([
        { id: "match1", shift: shiftRow("shiftD", "Klus D"), respondedAt: null, expiresAt: new Date(), createdAt: new Date() },
      ]); // the "not chosen" query

    const work = await getMyWork("u1");

    expect(work.history).toHaveLength(0);
    expect(work.notChosen).toHaveLength(1);
    expect(work.notChosen[0]).toMatchObject({ status: "rejected", offerRateCents: null, workKey: "nm:match1" });
  });

  it("a dismissed workKey never resurfaces", async () => {
    freelancerProfileFindUnique.mockResolvedValue({ id: "fp1", homeLatitude: NaN, homeLongitude: NaN });
    shiftAssignmentFindMany.mockResolvedValue([]);
    modelAgreementFindMany.mockResolvedValue([]);
    offersForUser.mockResolvedValue([]);
    shiftFindMany.mockResolvedValue([]);
    shiftMatchFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "match2", shift: shiftRow("shiftE", "Klus E"), respondedAt: null, expiresAt: new Date(), createdAt: new Date() },
      ]);
    getPrefs.mockResolvedValueOnce({ confirmations: {}, dismissedWorkItemIds: ["nm:match2"] });

    const work = await getMyWork("u1");

    expect(work.history).toHaveLength(0);
    expect(work.notChosen).toHaveLength(0);
  });
});

describe("getMyWork — verlopen reacties en vervangingen", () => {
  const H = 3_600_000;
  const verleden = (id: string, title: string, uurGeleden: number) => ({
    ...shiftRow(id, title),
    startsAt: new Date(Date.now() - uurGeleden * H),
    endsAt: new Date(Date.now() - (uurGeleden - 4) * H),
  });
  const reactie = (shiftId: string, status: string, proposedRateCents = 1500) => ({ ...acceptedOffer(shiftId), proposedRateCents, listedRateCents: 1500, status, respondedAt: null });
  const leeg = () => {
    freelancerProfileFindUnique.mockResolvedValue({ id: "fp1", homeLatitude: NaN, homeLongitude: NaN });
    shiftAssignmentFindMany.mockResolvedValue([]);
    modelAgreementFindMany.mockResolvedValue([]);
    shiftMatchFindMany.mockResolvedValue([]);
  };

  it("een reactie zonder keuze op een klus die al begon staat als niet uitgekozen onder In afwachting, niet in het archief", async () => {
    leeg();
    offersForUser.mockResolvedValue([reactie("oud", "pending"), reactie("straks", "pending")]);
    shiftFindMany.mockResolvedValue([verleden("oud", "Oude klus", 6), shiftRow("straks", "Klus morgen")]);

    const work = await getMyWork("u1");

    expect(work.pending.map((i) => i.shift.id)).toEqual(["straks"]);
    expect(work.history).toHaveLength(0);
    expect(work.notChosen).toHaveLength(1);
    expect(work.notChosen[0]).toMatchObject({ status: "rejected", rejectedKind: "expired", offerStatusLabel: "Niet uitgekozen" });
    expect(work.notChosen[0]?.shift.myOffer?.status).toBe("expired");
  });

  it("onderscheidt een afgewezen tegenbod van een gewone reactie die niet gekozen is", async () => {
    leeg();
    offersForUser.mockResolvedValue([reactie("a", "declined"), reactie("b", "declined", 1900), reactie("c", "expired")]);
    shiftFindMany.mockResolvedValue([shiftRow("a", "A"), shiftRow("b", "B"), verleden("c", "C", 30)]);

    const work = await getMyWork("u1");
    const soort = Object.fromEntries(work.notChosen.map((i) => [i.shift.id, i.rejectedKind]));
    expect(soort).toEqual({ a: "notChosen", b: "counter", c: "expired" });
  });

  it("een voorbije klus met een open vervangingsverzoek gaat naar de uren, niet blijvend onder Uitgekozen", async () => {
    leeg();
    offersForUser.mockResolvedValue([]);
    shiftFindMany.mockResolvedValue([]);
    shiftAssignmentFindMany.mockResolvedValue([
      { id: "asg9", acceptedAt: new Date(), cancelledAt: null, cancelReason: null, shift: verleden("shiftR", "Klus R", 8), timesheet: { id: "ts9", status: "DRAFT" } },
    ]);
    const { listReplacementRequests } = await import("@/lib/replacements/store");
    vi.mocked(listReplacementRequests).mockResolvedValueOnce([
      { id: "r1", at: new Date().toISOString(), userId: "u1", freelancerName: "Jan", assignmentId: "asg9", shiftId: "shiftR", shiftTitle: "Klus R", branch: "B", startsAt: new Date().toISOString(), note: "", status: "open", responses: [] },
    ]);

    const work = await getMyWork("u1");

    expect(work.active).toHaveLength(0);
    expect(work.hours.map((i) => [i.shift.id, i.status, i.replacementRequested])).toEqual([["shiftR", "hours", false]]);
  });
});
