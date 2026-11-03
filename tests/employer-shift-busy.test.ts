import { describe, expect, it, vi } from "vitest";

// Een werkgever ziet bij de reacties op een dienst of een kandidaat intussen op
// hetzelfde tijdstip elders is ingepland (dan zou accepteren worden geweigerd,
// lib/shifts/worker-overlap.ts). Alleen dát feit, nooit bij wie.

const h = vi.hoisted(() => ({ busyWhere: [] as unknown[] }));

vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined }));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["t-test"], branchIds: null }) }));
vi.mock("@/lib/offers/store", () => ({
  listCounterOffers: async () => [
    { id: "o1", shiftId: "sh1", userId: "w1", freelancerName: "Sanne", proposedRateCents: 1800, listedRateCents: 1800, note: "", status: "pending", at: "2026-11-03T10:00:00Z" },
    { id: "o2", shiftId: "sh1", userId: "w2", freelancerName: "Piet", proposedRateCents: 1900, listedRateCents: 1800, note: "", status: "pending", at: "2026-11-03T11:00:00Z" },
  ],
}));
vi.mock("@/lib/replacements/store", () => ({ listReplacementRequests: async () => [] }));
vi.mock("@/lib/profile/store", () => ({ getUserAvatars: async () => ({}) }));
vi.mock("@/lib/reviews/store", () => ({ reviewSummary: async () => ({ average: 0, count: 0 }) }));
vi.mock("@/lib/pools/store", () => ({ poolsInvitedToShift: async () => [] }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: {
      findFirst: async () => ({
        id: "sh1",
        title: "Magazijn",
        description: null,
        startsAt: new Date("2026-11-05T07:00:00Z"),
        endsAt: new Date("2026-11-05T15:30:00Z"),
        breakMinutes: 30,
        hourlyRateCents: 1800,
        positions: 2,
        status: "OPEN",
        visibility: "PUBLIC",
        requiredSkill: null,
        branch: { id: "b1", name: "Hal 1", city: "Utrecht", tenantId: "t-test" },
        assignments: [],
        matches: [],
      }),
    },
    freelancerProfile: { findMany: async () => [] },
    shiftAssignment: {
      findMany: async (args: { where: unknown }) => {
        h.busyWhere.push(args.where);
        return [{ freelancer: { userId: "w1" } }];
      },
    },
  },
}));

import { getEmployerShift } from "@/lib/dashboard/employer-shift";
import type { Principal } from "@/lib/auth";

const hq = { userId: "u-test", email: "t@example.com", fullName: "Test", grants: [], memberships: [{ tenantId: "t-test", role: "HQ_ADMIN" }], managedBranchIds: [] } as unknown as Principal;

describe("reacties op een dienst — elders ingepland", () => {
  it("markeert alleen de kandidaat die op dat tijdstip al elders werkt", async () => {
    const s = await getEmployerShift(hq, "sh1");
    const busy = Object.fromEntries((s?.offers ?? []).map((o) => [o.userId, o.busyElsewhere]));
    expect(busy).toEqual({ w1: true, w2: false });
    expect(h.busyWhere[0]).toEqual({
      cancelledAt: null,
      shiftId: { not: "sh1" },
      freelancer: { userId: { in: ["w1", "w2"] } },
      shift: { startsAt: { lt: new Date("2026-11-05T15:30:00Z") }, endsAt: { gt: new Date("2026-11-05T07:00:00Z") } },
    });
  });
});
