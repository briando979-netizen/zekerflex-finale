import { afterEach, describe, expect, it, vi } from "vitest";

// The freelancer's half of the hours-correction tegenbod
// (lib/disputes/raise.ts proposeHoursCorrection): previously a manager's
// correction was a unilateral override the freelancer had no say in. Now
// they must explicitly accept (applies it) or reject (escalates to the
// admin Dispute Console) — and can only ever respond to their OWN timesheet.

const disputeFindUnique = vi.fn();
const disputeUpdate = vi.fn();
const timesheetUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dispute: {
      findUnique: (...a: unknown[]) => disputeFindUnique(...a),
      update: (...a: unknown[]) => disputeUpdate(...a),
    },
    timesheet: { update: (...a: unknown[]) => timesheetUpdate(...a) },
    $transaction: async (ops: unknown[]) => Promise.all(ops),
  },
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { acceptHoursCorrection, rejectHoursCorrection } from "@/lib/disputes/respond";

function openDispute(over: Record<string, unknown> = {}) {
  return {
    id: "dispute1",
    status: "OPEN",
    raisedById: "manager1",
    claimedMinutes: 480,
    proposedMinutes: 420,
    timesheetId: "ts1",
    timesheet: { id: "ts1", freelancer: { userId: "freelancer1" } },
    ...over,
  };
}

afterEach(() => vi.clearAllMocks());

describe("acceptHoursCorrection", () => {
  it("applies the proposed minutes and puts the timesheet back to SUBMITTED", async () => {
    disputeFindUnique.mockResolvedValue(openDispute());
    disputeUpdate.mockResolvedValue({ status: "RESOLVED_OVERRULED" });
    timesheetUpdate.mockResolvedValue({});

    const result = await acceptHoursCorrection("dispute1", "freelancer1");

    expect(result).toEqual({ status: "RESOLVED_OVERRULED", resolvedMinutes: 420 });
    expect(disputeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "RESOLVED_OVERRULED", resolvedMinutes: 420, resolvedById: "freelancer1" }),
      }),
    );
    expect(timesheetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "SUBMITTED", billableMinutes: 420 } }),
    );
  });

  it("refuses a dispute that belongs to someone else's timesheet", async () => {
    disputeFindUnique.mockResolvedValue(openDispute({ timesheet: { id: "ts1", freelancer: { userId: "someone-else" } } }));
    await expect(acceptHoursCorrection("dispute1", "freelancer1")).rejects.toThrow();
    expect(disputeUpdate).not.toHaveBeenCalled();
  });

  it("refuses a dispute that's already been resolved", async () => {
    disputeFindUnique.mockResolvedValue(openDispute({ status: "RESOLVED_OVERRULED" }));
    await expect(acceptHoursCorrection("dispute1", "freelancer1")).rejects.toThrow();
    expect(disputeUpdate).not.toHaveBeenCalled();
  });

  it("refuses a system-raised dispute (no human proposal to accept)", async () => {
    disputeFindUnique.mockResolvedValue(openDispute({ raisedById: null }));
    await expect(acceptHoursCorrection("dispute1", "freelancer1")).rejects.toThrow();
    expect(disputeUpdate).not.toHaveBeenCalled();
  });

  it("refuses a bare review request with no actual proposed number", async () => {
    disputeFindUnique.mockResolvedValue(openDispute({ claimedMinutes: 480, proposedMinutes: 480 }));
    await expect(acceptHoursCorrection("dispute1", "freelancer1")).rejects.toThrow();
    expect(disputeUpdate).not.toHaveBeenCalled();
  });
});

describe("rejectHoursCorrection", () => {
  it("escalates the dispute instead of resolving it, and does not touch the timesheet's minutes", async () => {
    disputeFindUnique.mockResolvedValue(openDispute());
    disputeUpdate.mockResolvedValue({ status: "ESCALATED" });

    const result = await rejectHoursCorrection("dispute1", "freelancer1");

    expect(result).toEqual({ status: "ESCALATED", resolvedMinutes: null });
    expect(disputeUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "ESCALATED" } }));
    expect(timesheetUpdate).not.toHaveBeenCalled();
  });

  it("refuses a dispute that belongs to someone else's timesheet", async () => {
    disputeFindUnique.mockResolvedValue(openDispute({ timesheet: { id: "ts1", freelancer: { userId: "someone-else" } } }));
    await expect(rejectHoursCorrection("dispute1", "freelancer1")).rejects.toThrow();
    expect(disputeUpdate).not.toHaveBeenCalled();
  });
});
