import { afterEach, describe, expect, it, vi } from "vitest";

const freelancerProfileFindUnique = vi.fn();
const shiftFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: (...a: unknown[]) => freelancerProfileFindUnique(...a) },
    shift: { findUnique: (...a: unknown[]) => shiftFindUnique(...a) },
  },
}));

const payoutEligibility = vi.fn();
vi.mock("@/lib/fiscal/eligibility", () => ({ payoutEligibility: (...a: unknown[]) => payoutEligibility(...a) }));

vi.mock("@/lib/employer/relations", () => ({ isBlockedByAny: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/pools/store", () => ({ isInvitedToPoolOnlyShift: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/geo/geofencing", () => ({ haversineMeters: vi.fn().mockReturnValue(0) }));
vi.mock("@/lib/notifications/dispatcher", () => ({ recordOfferResponse: vi.fn() }));

import { applyToShift } from "@/lib/matching/apply";

const PROFILE = {
  id: "fp1",
  kvkValid: true,
  isBlacklisted: false,
  matchingBlockedUntil: null,
  homeLatitude: 52.37,
  homeLongitude: 4.9,
  user: { kycStatus: "VERIFIED" },
};

const BASE_SHIFT = {
  id: "shift1",
  status: "OPEN",
  positions: 1,
  viaUitzendbureau: false,
  visibility: "PUBLIC",
  branch: { tenantId: "t1", latitude: 52.37, longitude: 4.9, geofenceRadiusMeters: 150 },
  _count: { assignments: 0 },
};

afterEach(() => vi.clearAllMocks());

describe("applyToShift — late-acceptance grace window", () => {
  it("refuses an application more than 2 hours after the shift's real start", async () => {
    freelancerProfileFindUnique.mockResolvedValue(PROFILE);
    payoutEligibility.mockResolvedValue({ ok: true, track: "invoice", reason: null });
    shiftFindUnique.mockResolvedValue({ ...BASE_SHIFT, startsAt: new Date(Date.now() - 150 * 60_000) });

    await expect(applyToShift("u1", "shift1")).rejects.toThrow(/2 uur/);
  });

  it("does not reject solely for the grace-window check within 2 hours of the real start", async () => {
    freelancerProfileFindUnique.mockResolvedValue(PROFILE);
    payoutEligibility.mockResolvedValue({ ok: true, track: "invoice", reason: null });
    shiftFindUnique.mockResolvedValue({ ...BASE_SHIFT, startsAt: new Date(Date.now() - 90 * 60_000) });

    // Not asserting full success here (recordOfferResponse internals aren't
    // mocked deeply) — only that it gets past the grace-window guard instead
    // of failing with the "already started" conflict.
    await applyToShift("u1", "shift1").catch((err) => {
      expect((err as Error).message).not.toMatch(/2 uur/);
    });
  });
});
