import { afterEach, describe, expect, it, vi } from "vitest";

// An accepted tegenbod computed status "active" but the push logic only
// checked for "pending"/"rejected" — so it landed in none of the three
// buckets and silently vanished from "Mijn klussen" ("het verdwijnt").
// Now: it still shows (as "Geaccepteerd") unless a real assignment for that
// shift already represents it, to avoid showing the same shift twice once
// accepting an offer finalises a real assignment.

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

vi.mock("@/lib/prefs/store", () => ({
  getPrefs: vi.fn().mockResolvedValue({ confirmations: {} }),
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
  it("still shows an accepted offer with no real assignment yet, instead of dropping it", async () => {
    freelancerProfileFindUnique.mockResolvedValue({ id: "fp1", homeLatitude: NaN, homeLongitude: NaN });
    shiftAssignmentFindMany.mockResolvedValue([]);
    modelAgreementFindMany.mockResolvedValue([]);
    shiftMatchFindMany.mockResolvedValue([]);
    offersForUser.mockResolvedValue([acceptedOffer("shiftA")]);
    shiftFindMany.mockResolvedValue([shiftRow("shiftA", "Klus A")]);

    const work = await getMyWork("u1");

    expect(work.pending.map((i) => i.shift.id)).toContain("shiftA");
    expect(work.pending.find((i) => i.shift.id === "shiftA")?.offerStatusLabel).toBe("Geaccepteerd");
    expect(work.active).toHaveLength(0);
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
});
