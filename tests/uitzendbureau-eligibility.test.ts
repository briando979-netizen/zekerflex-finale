import { afterEach, describe, expect, it, vi } from "vitest";

// A shift marked "viaUitzendbureau" exists only to be filled by payroll-track
// workers (uitzendkrachten) — ZekerFlex is their formal employer. Before this,
// any zzp'er/flexwerker could apply/counter-offer on it exactly like any
// other shift, which defeats the point of the flag entirely.

const freelancerProfileFindUnique = vi.fn();
const shiftFindUnique = vi.fn();
const shiftMatchUpsert = vi.fn();
const shiftAssignmentFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: (...a: unknown[]) => freelancerProfileFindUnique(...a) },
    shift: { findUnique: (...a: unknown[]) => shiftFindUnique(...a) },
    shiftMatch: { upsert: (...a: unknown[]) => shiftMatchUpsert(...a) },
    shiftAssignment: { findUnique: (...a: unknown[]) => shiftAssignmentFindUnique(...a) },
  },
}));

const payoutEligibility = vi.fn();
vi.mock("@/lib/fiscal/eligibility", () => ({ payoutEligibility: (...a: unknown[]) => payoutEligibility(...a) }));

const isBlockedByAny = vi.fn().mockResolvedValue(false);
vi.mock("@/lib/employer/relations", () => ({ isBlockedByAny: (...a: unknown[]) => isBlockedByAny(...a) }));

const recordOfferResponse = vi.fn().mockResolvedValue({ status: "ACCEPTED", shiftFilled: false });
vi.mock("@/lib/notifications/dispatcher", () => ({ recordOfferResponse: (...a: unknown[]) => recordOfferResponse(...a) }));

import { applyToShift } from "@/lib/matching/apply";
import { AppError } from "@/lib/errors";

const profile = {
  id: "fp1",
  kvkValid: true,
  isBlacklisted: false,
  matchingBlockedUntil: null,
  homeLatitude: 52.0,
  homeLongitude: 5.0,
  user: { kycStatus: "VERIFIED" },
};

const uitzendShift = {
  id: "shift1",
  status: "OPEN",
  startsAt: new Date(Date.now() + 86_400_000),
  positions: 1,
  viaUitzendbureau: true,
  branch: { tenantId: "org1", latitude: 52.1, longitude: 5.1, geofenceRadiusMeters: 500 },
  _count: { assignments: 0 },
};

afterEach(() => vi.clearAllMocks());

describe("applyToShift — viaUitzendbureau gate", () => {
  it("blocks a zzp'er/flexwerker from a shift reserved for uitzendkrachten", async () => {
    freelancerProfileFindUnique.mockResolvedValue(profile);
    payoutEligibility.mockResolvedValue({ ok: true, track: "invoice", reason: null });
    shiftFindUnique.mockResolvedValue(uitzendShift);

    await expect(applyToShift("u1", "shift1")).rejects.toThrow(
      "Deze klus is alleen voor uitzendkrachten via het ZekerFlex-uitzendbureau.",
    );
    expect(shiftMatchUpsert).not.toHaveBeenCalled();
    expect(recordOfferResponse).not.toHaveBeenCalled();
  });

  it("allows an uitzendkracht (payroll track) to apply to the same shift", async () => {
    freelancerProfileFindUnique.mockResolvedValue(profile);
    payoutEligibility.mockResolvedValue({ ok: true, track: "payroll", reason: null });
    shiftFindUnique.mockResolvedValue(uitzendShift);
    shiftAssignmentFindUnique.mockResolvedValue(null);

    const result = await applyToShift("u1", "shift1");

    expect(result.status).toBe("ACCEPTED");
    expect(recordOfferResponse).toHaveBeenCalledWith("shift1", "fp1", "ACCEPTED");
  });

  it("never blocks a regular (non-uitzendbureau) shift for a zzp'er", async () => {
    freelancerProfileFindUnique.mockResolvedValue(profile);
    payoutEligibility.mockResolvedValue({ ok: true, track: "invoice", reason: null });
    shiftFindUnique.mockResolvedValue({ ...uitzendShift, viaUitzendbureau: false });
    shiftAssignmentFindUnique.mockResolvedValue(null);

    const result = await applyToShift("u1", "shift1");

    expect(result.status).toBe("ACCEPTED");
  });

  it("surfaces as an AppError (not a generic throw) so the UI shows a clean message", async () => {
    freelancerProfileFindUnique.mockResolvedValue(profile);
    payoutEligibility.mockResolvedValue({ ok: true, track: "invoice", reason: null });
    shiftFindUnique.mockResolvedValue(uitzendShift);

    await expect(applyToShift("u1", "shift1")).rejects.toBeInstanceOf(AppError);
  });
});
