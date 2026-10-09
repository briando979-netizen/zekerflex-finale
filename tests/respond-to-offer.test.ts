import { afterEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/lib/auth";
import { AppError } from "@/lib/errors";

// Accepting a tegenbod used to only flip the offer's status and tell the
// freelancer "you can now claim the shift" in chat — but there is no button
// anywhere for them to do that once they've already reacted, so the shift
// silently vanished from "Mijn klussen" instead of ever becoming "uitgekozen".
// Accepting must finalise the real assignment itself.

const requirePrincipal = vi.fn();
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requirePrincipal: () => requirePrincipal() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const shiftFindFirst = vi.fn();
const shiftUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: { findFirst: (...a: unknown[]) => shiftFindFirst(...a), update: (...a: unknown[]) => shiftUpdate(...a) },
  },
}));

const resolveEmployerScope = vi.fn();
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: (...a: unknown[]) => resolveEmployerScope(...a) }));

const listCounterOffers = vi.fn();
const setOfferStatus = vi.fn();
vi.mock("@/lib/offers/store", () => ({
  listCounterOffers: (...a: unknown[]) => listCounterOffers(...a),
  setOfferStatus: (...a: unknown[]) => setOfferStatus(...a),
}));

const applyToShift = vi.fn();
vi.mock("@/lib/matching/apply", () => ({ applyToShift: (...a: unknown[]) => applyToShift(...a) }));

vi.mock("@/lib/messaging/store", () => ({
  ensureDirectThread: vi.fn().mockResolvedValue({ id: "thread1" }),
  postMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { respondToOfferAction } from "@/app/werkgever/diensten/[shiftId]/actions";

function manager(): Principal {
  return {
    userId: "mgr1",
    email: "manager@zekerflex.com",
    fullName: "Manager",
    emailVerifiedAt: new Date(),
    grants: [{ role: "LOCAL_MANAGER", organizationId: "org1", locationIds: ["branch1"] }],
    memberships: [],
    managedBranchIds: ["branch1"],
  } as Principal;
}

const offer = {
  id: "offer1",
  at: new Date().toISOString(),
  userId: "freelancer1",
  freelancerName: "Jan",
  shiftId: "shift1",
  shiftTitle: "Receptiemedewerker",
  branch: "Branch 1",
  listedRateCents: 1500,
  proposedRateCents: 1800,
  note: "",
  status: "pending" as const,
  respondedAt: null,
};

const shift = {
  id: "shift1",
  title: "Receptiemedewerker",
  hourlyRateCents: 1500,
  status: "OPEN",
};

afterEach(() => vi.clearAllMocks());

describe("respondToOfferAction", () => {
  it("accepts an offer by finalising a real assignment, not just flipping a status", async () => {
    requirePrincipal.mockResolvedValue(manager());
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["org1"], branchIds: ["branch1"] });
    listCounterOffers.mockResolvedValue([offer]);
    shiftFindFirst.mockResolvedValue(shift);
    shiftUpdate.mockResolvedValue({});
    applyToShift.mockResolvedValue({ status: "ACCEPTED", shiftFilled: false });
    setOfferStatus.mockResolvedValue({ ...offer, status: "accepted" });

    const result = await respondToOfferAction("offer1", "accepted");

    expect(applyToShift).toHaveBeenCalledWith("freelancer1", "shift1");
    expect(setOfferStatus).toHaveBeenCalledWith("offer1", "accepted");
    expect(result).toEqual({ ok: true, message: expect.stringContaining("toegewezen") });
  });

  it("leaves the offer pending when the assignment can't actually be finalised", async () => {
    requirePrincipal.mockResolvedValue(manager());
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["org1"], branchIds: ["branch1"] });
    listCounterOffers.mockResolvedValue([offer]);
    shiftFindFirst.mockResolvedValue(shift);
    shiftUpdate.mockResolvedValue({});
    applyToShift.mockRejectedValue(AppError.conflict("Deze dienst is al vol."));

    const result = await respondToOfferAction("offer1", "accepted");

    expect(setOfferStatus).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Deze dienst is al vol.");
  });

  it("declines an offer without touching the assignment path", async () => {
    requirePrincipal.mockResolvedValue(manager());
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["org1"], branchIds: ["branch1"] });
    listCounterOffers.mockResolvedValue([offer]);
    shiftFindFirst.mockResolvedValue(shift);
    setOfferStatus.mockResolvedValue({ ...offer, status: "declined" });

    const result = await respondToOfferAction("offer1", "declined");

    expect(applyToShift).not.toHaveBeenCalled();
    expect(shiftUpdate).not.toHaveBeenCalled();
    expect(setOfferStatus).toHaveBeenCalledWith("offer1", "declined");
    expect(result.ok).toBe(true);
  });

  it("calls a reaction at the listed rate a 'reactie', not a 'tegenbod'", async () => {
    const plainReaction = { ...offer, listedRateCents: offer.proposedRateCents };
    requirePrincipal.mockResolvedValue(manager());
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["org1"], branchIds: ["branch1"] });
    listCounterOffers.mockResolvedValue([plainReaction]);
    shiftFindFirst.mockResolvedValue(shift);
    shiftUpdate.mockResolvedValue({});
    applyToShift.mockResolvedValue({ status: "ACCEPTED", shiftFilled: false });
    setOfferStatus.mockResolvedValue({ ...plainReaction, status: "accepted" });

    const result = await respondToOfferAction("offer1", "accepted");

    expect(result.message.toLowerCase()).not.toContain("tegenbod");
    expect(result.message).toContain("Reactie");
  });
});
