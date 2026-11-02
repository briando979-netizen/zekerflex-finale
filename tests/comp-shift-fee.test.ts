import { beforeEach, describe, expect, it, vi } from "vitest";

// De pagina van een dienst toont de bemiddelingsfee: € 3,50 per uur, of € 0
// voor een kosteloos bedrijf (lib/billing/comp) — gelijk aan de echte factuur.

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(store.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["t-test"], branchIds: null }) }));
vi.mock("@/lib/offers/store", () => ({ listCounterOffers: async () => [] }));
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
        startsAt: new Date("2026-11-03T07:00:00Z"),
        endsAt: new Date("2026-11-03T15:30:00Z"),
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
  },
}));

import { getEmployerShift } from "@/lib/dashboard/employer-shift";
import { setComp } from "@/lib/billing/comp";
import { env } from "@/lib/env";
import type { Principal } from "@/lib/auth";

const hq = { userId: "u-test", email: "t@x.nl", fullName: "Test", grants: [], memberships: [{ tenantId: "t-test", role: "HQ_ADMIN" }], managedBranchIds: [] } as unknown as Principal;

beforeEach(() => store.clear());

describe("bemiddelingsfee op de pagina van een dienst", () => {
  it("is € 3,50 per gewerkt uur voor een gewoon bedrijf", async () => {
    const s = await getEmployerShift(hq, "sh1");
    expect(s?.hours).toBe(8);
    expect(s?.platformFeeCents).toBe(8 * env.PLATFORM_FEE_PER_HOUR_CENTS);
    expect(s?.platformFeeFree).toBe(false);
  });

  it("is € 0 voor een kosteloos bedrijf, net als de factuur", async () => {
    await setComp({ userId: "u-test", email: "t@x.nl", tenantIds: ["t-test"], on: true, reason: "", by: { userId: "admin", name: "Eigenaar" } });
    const s = await getEmployerShift(hq, "sh1");
    expect(s?.platformFeeCents).toBe(0);
    expect(s?.platformFeeFree).toBe(true);
    expect(s?.grossPerSeatCents).toBe(8 * 1800); // de flexwerker krijgt gewoon betaald
  });
});
