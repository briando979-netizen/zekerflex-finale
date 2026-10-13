import { afterEach, describe, expect, it, vi } from "vitest";

// Previously an employer got zero real-time feedback when a freelancer
// responded to a shift — recordOfferResponse() never notified anyone, and
// the notification-bell feed's own attempt at this was a dead stub
// (offersForUser("__none__"), matching nobody). This is the polling endpoint
// the new RecentResponseAlert card uses instead.

const getPrincipal = vi.fn();
const requireRole = vi.fn();
const resolveEmployerScope = vi.fn();
const shiftAssignmentFindMany = vi.fn();
const shiftFindMany = vi.fn();
const listCounterOffers = vi.fn();

vi.mock("@/lib/auth", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    requirePrincipal: async () => {
      const p = await getPrincipal();
      if (!p) throw AppError.unauthenticated();
      return p;
    },
    requireRole: (...a: unknown[]) => requireRole(...a),
  };
});
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: (...a: unknown[]) => resolveEmployerScope(...a) }));
vi.mock("@/lib/offers/store", () => ({ listCounterOffers: (...a: unknown[]) => listCounterOffers(...a) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shiftAssignment: { findMany: (...a: unknown[]) => shiftAssignmentFindMany(...a) },
    shift: { findMany: (...a: unknown[]) => shiftFindMany(...a) },
  },
}));

import { GET } from "@/app/api/werkgever/recent-responses/route";

function req(since: string) {
  return new Request(`http://localhost/api/werkgever/recent-responses?since=${encodeURIComponent(since)}`);
}

const SINCE = new Date(Date.now() - 60_000).toISOString();

afterEach(() => vi.clearAllMocks());

describe("GET /api/werkgever/recent-responses", () => {
  it("returns a direct-accept event for an assignment accepted after `since`", async () => {
    getPrincipal.mockResolvedValue({ userId: "mgr1" });
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    shiftAssignmentFindMany.mockResolvedValue([
      {
        id: "asg1",
        acceptedAt: new Date(),
        freelancer: { userId: "fl1", user: { fullName: "Jan de Vries" } },
        shift: { id: "shift1", title: "Vakkenvuller" },
      },
    ]);
    shiftFindMany.mockResolvedValue([]);
    listCounterOffers.mockResolvedValue([]);

    const res = await GET(req(SINCE));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.responses).toEqual([
      expect.objectContaining({ type: "direct_accept", freelancerName: "Jan de Vries", shiftId: "shift1" }),
    ]);
  });

  it("returns a counter-offer event only for a shift in the employer's own scope", async () => {
    getPrincipal.mockResolvedValue({ userId: "mgr1" });
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    shiftAssignmentFindMany.mockResolvedValue([]);
    shiftFindMany.mockResolvedValue([{ id: "myshift" }]);
    listCounterOffers.mockResolvedValue([
      {
        id: "o1",
        at: new Date().toISOString(),
        userId: "fl1",
        freelancerName: "Marieke Jansen",
        shiftId: "myshift",
        shiftTitle: "Horeca-dienst",
        branch: "Centrum",
        listedRateCents: 1800,
        proposedRateCents: 2000,
        note: "",
        status: "pending",
        respondedAt: null,
      },
      {
        id: "o2",
        at: new Date().toISOString(),
        userId: "fl2",
        freelancerName: "Someone Else",
        shiftId: "not-my-shift",
        shiftTitle: "Other",
        branch: "Elsewhere",
        listedRateCents: 1800,
        proposedRateCents: 1900,
        note: "",
        status: "pending",
        respondedAt: null,
      },
    ]);

    const res = await GET(req(SINCE));
    const json = await res.json();

    expect(json.responses).toHaveLength(1);
    expect(json.responses[0]).toMatchObject({ type: "counter_offer", shiftId: "myshift", freelancerName: "Marieke Jansen" });
  });

  it("excludes a counter-offer that is no longer pending", async () => {
    getPrincipal.mockResolvedValue({ userId: "mgr1" });
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    shiftAssignmentFindMany.mockResolvedValue([]);
    shiftFindMany.mockResolvedValue([{ id: "myshift" }]);
    listCounterOffers.mockResolvedValue([
      {
        id: "o1",
        at: new Date().toISOString(),
        userId: "fl1",
        freelancerName: "Marieke Jansen",
        shiftId: "myshift",
        shiftTitle: "Horeca-dienst",
        branch: "Centrum",
        listedRateCents: 1800,
        proposedRateCents: 2000,
        note: "",
        status: "accepted",
        respondedAt: new Date().toISOString(),
      },
    ]);

    const res = await GET(req(SINCE));
    const json = await res.json();
    expect(json.responses).toHaveLength(0);
  });

  it("excludes an offer older than `since`", async () => {
    getPrincipal.mockResolvedValue({ userId: "mgr1" });
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    shiftAssignmentFindMany.mockResolvedValue([]);
    shiftFindMany.mockResolvedValue([{ id: "myshift" }]);
    listCounterOffers.mockResolvedValue([
      {
        id: "o1",
        at: new Date(Date.now() - 3600_000).toISOString(),
        userId: "fl1",
        freelancerName: "Marieke Jansen",
        shiftId: "myshift",
        shiftTitle: "Horeca-dienst",
        branch: "Centrum",
        listedRateCents: 1800,
        proposedRateCents: 2000,
        note: "",
        status: "pending",
        respondedAt: null,
      },
    ]);

    const res = await GET(req(SINCE));
    const json = await res.json();
    expect(json.responses).toHaveLength(0);
  });

  it("requires authentication", async () => {
    getPrincipal.mockResolvedValue(null);
    const res = await GET(req(SINCE));
    expect(res.status).toBe(401);
  });
});
