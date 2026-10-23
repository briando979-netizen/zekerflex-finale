import { afterEach, describe, expect, it, vi } from "vitest";

const kv: Record<string, unknown> = {};
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv[k] ?? null,
  kvSet: async (k: string, v: unknown) => void (kv[k] = v),
}));
const sendUserPush = vi.fn(async () => 1);
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: (...a: unknown[]) => sendUserPush(...(a as [])) }));
const isMatchEligibleWorker = vi.fn(async () => true);
vi.mock("@/lib/matching/engine", () => ({ isMatchEligibleWorker: (...a: unknown[]) => isMatchEligibleWorker(...(a as [])) }));
const blockedUserIdsForTenants = vi.fn(async () => new Set<string>());
vi.mock("@/lib/employer/relations", () => ({ blockedUserIdsForTenants: (...a: unknown[]) => blockedUserIdsForTenants(...(a as [])) }));

const shiftFindMany = vi.fn();
const profileFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { shift: { findMany: (...a: unknown[]) => shiftFindMany(...a) }, freelancerProfile: { findMany: (...a: unknown[]) => profileFindMany(...a) } } }));

import { notifyNearbyOpenShifts } from "@/lib/notifications/geo-push";

const NOW = new Date("2026-10-23T10:00:00Z");
// Utrecht centraal-ish
const BRANCH = { name: "AH", city: "Utrecht", latitude: 52.09, longitude: 5.11, tenantId: "t1" };

function shift(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    title: "Vakkenvuller",
    startsAt: new Date(NOW.getTime() + 2 * 3_600_000), // 2h out
    positions: 2,
    hourlyRateCents: 1650,
    viaUitzendbureau: false,
    requiredSkillId: null,
    branch: BRANCH,
    assignments: [],
    ...over,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(kv)) delete kv[k];
  isMatchEligibleWorker.mockResolvedValue(true);
  blockedUserIdsForTenants.mockResolvedValue(new Set());
});

describe("notifyNearbyOpenShifts", () => {
  it("pushes only to eligible workers within the radius, once each", async () => {
    shiftFindMany.mockResolvedValue([shift()]);
    profileFindMany.mockResolvedValue([
      { userId: "near", vatValid: true, kvkValid: true, homeLatitude: 52.1, homeLongitude: 5.12 }, // ~1km
      { userId: "far", vatValid: true, kvkValid: true, homeLatitude: 52.5, homeLongitude: 5.6 }, // ~55km
    ]);
    const sent = await notifyNearbyOpenShifts(NOW, 15);
    expect(sent).toBe(1);
    expect(sendUserPush).toHaveBeenCalledTimes(1);
    expect(sendUserPush.mock.calls[0]![0]).toEqual(["near"]);
    // second run: deduped, nobody pushed again
    expect(await notifyNearbyOpenShifts(NOW, 15)).toBe(0);
  });

  it("skips a shift that is already full, and blocked or ineligible workers", async () => {
    shiftFindMany.mockResolvedValue([shift({ id: "full", positions: 1, assignments: [{ id: "a" }] }), shift({ id: "open" })]);
    profileFindMany.mockResolvedValue([{ userId: "w", vatValid: true, kvkValid: true, homeLatitude: 52.1, homeLongitude: 5.12 }]);
    blockedUserIdsForTenants.mockResolvedValue(new Set(["w"]));
    expect(await notifyNearbyOpenShifts(NOW, 15)).toBe(0);
  });
});
