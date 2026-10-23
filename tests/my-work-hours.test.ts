import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A klus whose hours still have to be filled in showed up under
// "Mijn klussen → Gearchiveerd" (it was even archived the moment it started).
// It belongs only on "Uren invullen" until the hours are handed in.

const shiftAssignmentFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: async () => ({ id: "fp1", homeLatitude: NaN, homeLongitude: NaN }) },
    shiftAssignment: { findMany: (...a: unknown[]) => shiftAssignmentFindMany(...a) },
    modelAgreement: { findMany: async () => [] },
    shift: { findMany: async () => [] },
    shiftMatch: { findMany: async () => [] },
  },
}));
vi.mock("@/lib/prefs/store", () => ({ getPrefs: async () => ({ confirmations: {}, dismissedWorkItemIds: [] }) }));
vi.mock("@/lib/replacements/store", () => ({ listReplacementRequests: async () => [] }));
vi.mock("@/lib/offers/store", () => ({ offersForUser: async () => [] }));

import { getMyWork } from "@/lib/dashboard/my-work";

const HOUR = 3_600_000;

function assignment(id: string, startOffsetH: number, endOffsetH: number, timesheetStatus: string | null, cancelled = false) {
  return {
    id,
    acceptedAt: new Date(),
    cancelledAt: cancelled ? new Date() : null,
    cancelReason: null,
    shift: {
      id: `shift-${id}`,
      title: `Klus ${id}`,
      description: null,
      startsAt: new Date(Date.now() + startOffsetH * HOUR),
      endsAt: new Date(Date.now() + endOffsetH * HOUR),
      breakMinutes: 0,
      hourlyRateCents: 1500,
      positions: 1,
      branchId: "branch1",
      requiredSkill: null,
      branch: { name: "Branch 1", city: "Rotterdam", latitude: 51.9, longitude: 4.5, tenant: { id: "org1", name: "Client" } },
      _count: { assignments: 1 },
    },
    timesheet: timesheetStatus ? { id: `ts-${id}`, status: timesheetStatus } : null,
  };
}

const ids = (items: { shift: { id: string } }[]) => items.map((i) => i.shift.id);

beforeEach(() => shiftAssignmentFindMany.mockReset());
afterEach(() => vi.clearAllMocks());

describe("Mijn klussen — hours to fill in", () => {
  it("puts an ended klus with draft hours on the 'Uren' bucket, not in the other tabs", async () => {
    shiftAssignmentFindMany.mockResolvedValue([assignment("draft", -10, -2, "DRAFT")]);
    const work = await getMyWork("u1");
    expect([...ids(work.pending), ...ids(work.active), ...ids(work.history)]).not.toContain("shift-draft");
    expect(ids(work.hours)).toContain("shift-draft");
  });

  it("keeps submitted hours on 'Uren' and archives only once approved or paid", async () => {
    shiftAssignmentFindMany.mockResolvedValue([
      assignment("sub", -30, -22, "SUBMITTED"),
      assignment("ok", -50, -42, "APPROVED"),
      assignment("paid", -80, -72, "PAID"),
    ]);
    const work = await getMyWork("u1");
    expect(ids(work.hours)).toContain("shift-sub"); // ingediend, blijft op "Uren"
    expect(ids(work.hours)).not.toContain("shift-ok"); // goedgekeurd → weg van "Uren"
    expect(ids(work.history).sort()).toEqual(["shift-ok", "shift-paid"]);
  });

  it("keeps a klus that is under way under Uitgekozen, not in the archive", async () => {
    shiftAssignmentFindMany.mockResolvedValue([assignment("now", -2, 4, "DRAFT")]);
    const work = await getMyWork("u1");
    expect(ids(work.active)).toContain("shift-now");
    expect(work.history).toHaveLength(0);
  });

  it("still shows an ended klus without any timesheet rather than losing it", async () => {
    shiftAssignmentFindMany.mockResolvedValue([assignment("none", -10, -2, null)]);
    expect(ids((await getMyWork("u1")).history)).toContain("shift-none");
  });

  it("a cancelled klus stays in the archive as cancelled", async () => {
    shiftAssignmentFindMany.mockResolvedValue([assignment("gone", -10, -2, "DRAFT", true)]);
    const work = await getMyWork("u1");
    expect(work.history.find((i) => i.shift.id === "shift-gone")?.status).toBe("cancelled");
  });
});
