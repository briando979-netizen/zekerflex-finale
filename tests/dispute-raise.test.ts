import { afterEach, describe, expect, it, vi } from "vitest";

// Previously a critical fraud/GPS signal on a SUBMITTED timesheet had no path
// forward at all: approveTimesheet() refuses it, and nothing (no UI, no
// automatic process) ever creates a Dispute for it outside the narrow
// auto-raise in checkin.ts (which only fires for an actual mocked/off-geofence
// CHECK_IN event, not e.g. an overlap or impossible-duration signal spotted
// later). raiseManagerReviewDispute() is the missing "escalate to the admin
// Dispute Console" action a manager can now take instead.

const timesheetFindUnique = vi.fn();
const timesheetUpdate = vi.fn();
const disputeCreate = vi.fn();
const assertBranchAccess = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    timesheet: {
      findUnique: (...a: unknown[]) => timesheetFindUnique(...a),
      update: (...a: unknown[]) => timesheetUpdate(...a),
    },
    dispute: { create: (...a: unknown[]) => disputeCreate(...a) },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        dispute: { create: (...a: unknown[]) => disputeCreate(...a) },
        timesheet: { update: (...a: unknown[]) => timesheetUpdate(...a) },
      }),
  },
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/auth", () => ({ assertBranchAccess: (...a: unknown[]) => assertBranchAccess(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const sendMail = vi.fn();
vi.mock("@/lib/mail", () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
  hoursCorrectionProposedEmail: (
    fullName: string,
    link: string,
    shiftTitle: string,
    claimedHours: number,
    proposedHours: number,
  ) => ({ to: "", subject: "x", kind: "uren-correctie-voorstel", text: link, html: link, _args: { fullName, shiftTitle, claimedHours, proposedHours } }),
}));

import { raiseManagerReviewDispute, proposeHoursCorrection } from "@/lib/disputes/raise";

const PRINCIPAL = { userId: "u1", email: "manager@example.nl" } as never;

afterEach(() => vi.clearAllMocks());

describe("raiseManagerReviewDispute", () => {
  it("creates an OPEN MANAGER_REVIEW dispute and moves the timesheet to DISPUTED", async () => {
    timesheetFindUnique.mockResolvedValue({
      id: "ts1",
      status: "SUBMITTED",
      billableMinutes: 480,
      branchId: "branch1",
      branch: { tenantId: "tenant1" },
      dispute: null,
    });
    disputeCreate.mockResolvedValue({ id: "dispute1" });
    timesheetUpdate.mockResolvedValue({});

    const result = await raiseManagerReviewDispute({ timesheetId: "ts1", principal: PRINCIPAL, reason: "overlap" });

    expect(result.disputeId).toBe("dispute1");
    expect(disputeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          timesheetId: "ts1",
          origin: "MANAGER_REVIEW",
          claimedMinutes: 480,
          proposedMinutes: 480,
        }),
      }),
    );
    expect(timesheetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ts1" }, data: { status: "DISPUTED" } }),
    );
  });

  it("is idempotent — returns the existing dispute instead of creating a second one", async () => {
    timesheetFindUnique.mockResolvedValue({
      id: "ts1",
      status: "SUBMITTED",
      billableMinutes: 480,
      branchId: "branch1",
      branch: { tenantId: "tenant1" },
      dispute: { id: "existing-dispute" },
    });

    const result = await raiseManagerReviewDispute({ timesheetId: "ts1", principal: PRINCIPAL, reason: "overlap" });

    expect(result.disputeId).toBe("existing-dispute");
    expect(disputeCreate).not.toHaveBeenCalled();
  });

  it("refuses to raise a dispute for a timesheet that isn't SUBMITTED", async () => {
    timesheetFindUnique.mockResolvedValue({
      id: "ts1",
      status: "APPROVED",
      billableMinutes: 480,
      branchId: "branch1",
      branch: { tenantId: "tenant1" },
      dispute: null,
    });

    await expect(
      raiseManagerReviewDispute({ timesheetId: "ts1", principal: PRINCIPAL, reason: "x" }),
    ).rejects.toThrow();
    expect(disputeCreate).not.toHaveBeenCalled();
  });

  it("checks branch access before raising", async () => {
    timesheetFindUnique.mockResolvedValue({
      id: "ts1",
      status: "SUBMITTED",
      billableMinutes: 480,
      branchId: "branch1",
      branch: { tenantId: "tenant1" },
      dispute: null,
    });
    assertBranchAccess.mockImplementationOnce(() => {
      throw new Error("forbidden");
    });

    await expect(
      raiseManagerReviewDispute({ timesheetId: "ts1", principal: PRINCIPAL, reason: "x" }),
    ).rejects.toThrow("forbidden");
  });
});

describe("proposeHoursCorrection", () => {
  function ts(over: Record<string, unknown> = {}) {
    return {
      id: "ts1",
      status: "SUBMITTED",
      billableMinutes: 480,
      branchId: "branch1",
      branch: { tenantId: "tenant1" },
      dispute: null,
      assignment: { shift: { title: "Vakkenvuller" } },
      freelancer: { user: { fullName: "Jan de Vries", email: "jan@example.nl" } },
      ...over,
    };
  }

  it("creates a dispute carrying both the claimed and proposed minutes, and mails the freelancer", async () => {
    timesheetFindUnique.mockResolvedValue(ts());
    disputeCreate.mockResolvedValue({ id: "dispute1" });
    timesheetUpdate.mockResolvedValue({});
    sendMail.mockResolvedValue({ delivered: true });

    const result = await proposeHoursCorrection({
      timesheetId: "ts1",
      principal: PRINCIPAL,
      proposedMinutes: 420,
      note: "Pauze niet afgetrokken",
    });

    expect(result.disputeId).toBe("dispute1");
    expect(disputeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ claimedMinutes: 480, proposedMinutes: 420, origin: "MANAGER_REVIEW" }),
      }),
    );
    expect(timesheetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "DISPUTED" } }),
    );
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "jan@example.nl" }));
  });

  it("rejects a proposal equal to the submitted hours — that's just a plain approval", async () => {
    timesheetFindUnique.mockResolvedValue(ts());
    await expect(
      proposeHoursCorrection({ timesheetId: "ts1", principal: PRINCIPAL, proposedMinutes: 480, note: "x" }),
    ).rejects.toThrow();
    expect(disputeCreate).not.toHaveBeenCalled();
  });

  it("rejects a proposal for MORE hours than submitted", async () => {
    timesheetFindUnique.mockResolvedValue(ts());
    await expect(
      proposeHoursCorrection({ timesheetId: "ts1", principal: PRINCIPAL, proposedMinutes: 500, note: "x" }),
    ).rejects.toThrow();
    expect(disputeCreate).not.toHaveBeenCalled();
  });

  it("refuses when a dispute/proposal is already open for this timesheet", async () => {
    timesheetFindUnique.mockResolvedValue(ts({ dispute: { id: "existing" } }));
    await expect(
      proposeHoursCorrection({ timesheetId: "ts1", principal: PRINCIPAL, proposedMinutes: 420, note: "x" }),
    ).rejects.toThrow();
    expect(disputeCreate).not.toHaveBeenCalled();
  });

  it("never lets a failed notification mail block the proposal from being created", async () => {
    timesheetFindUnique.mockResolvedValue(ts());
    disputeCreate.mockResolvedValue({ id: "dispute1" });
    timesheetUpdate.mockResolvedValue({});
    sendMail.mockRejectedValue(new Error("smtp down"));

    const result = await proposeHoursCorrection({
      timesheetId: "ts1",
      principal: PRINCIPAL,
      proposedMinutes: 420,
      note: "x",
    });

    expect(result.disputeId).toBe("dispute1");
  });
});
