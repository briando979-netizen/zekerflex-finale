import { afterEach, describe, expect, it, vi } from "vitest";

const freelancerProfileFindMany = vi.fn();
const freelancerProfileUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: {
      findMany: (...a: unknown[]) => freelancerProfileFindMany(...a),
      update: (...a: unknown[]) => freelancerProfileUpdate(...a),
    },
  },
}));

const getFiscal = vi.fn();
const invoiceModeFor = vi.fn();
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal: (...a: unknown[]) => getFiscal(...a),
  invoiceModeFor: (...a: unknown[]) => invoiceModeFor(...a),
}));

const getUitzendStatus = vi.fn();
vi.mock("@/lib/payroll/uitzend-status", () => ({
  getUitzendStatus: (...a: unknown[]) => getUitzendStatus(...a),
}));

const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));

const sendMail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/mail", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));

vi.mock("@/lib/env", () => ({ env: { MAIL_ADMIN: "admin@zekerflex.com" } }));

import { sweepAbuPhaseTransitions } from "@/lib/payroll/abu-phase-sweep";

function profile(userId: string, lastAbuPhase: string | null, name = "Jan") {
  return { id: `fp-${userId}`, userId, lastAbuPhase, user: { fullName: name, email: `${userId}@example.com` } };
}

afterEach(() => vi.clearAllMocks());

describe("sweepAbuPhaseTransitions", () => {
  it("skips a non-payroll (zzp/flexwerker) freelancer entirely", async () => {
    freelancerProfileFindMany.mockResolvedValue([profile("u1", "A")]);
    invoiceModeFor.mockReturnValue("self-invoice");
    getFiscal.mockResolvedValue({});

    const result = await sweepAbuPhaseTransitions();

    expect(result.checked).toBe(0);
    expect(getUitzendStatus).not.toHaveBeenCalled();
  });

  it("seeds the baseline silently on the first-ever check (no mail, no audit)", async () => {
    freelancerProfileFindMany.mockResolvedValue([profile("u1", null)]);
    invoiceModeFor.mockReturnValue("payroll");
    getFiscal.mockResolvedValue({});
    getUitzendStatus.mockResolvedValue({ phase: "B", weeksWorked: 60, hoursWorked: 1900 });

    const result = await sweepAbuPhaseTransitions();

    expect(result.seeded).toBe(1);
    expect(result.transitions).toHaveLength(0);
    expect(freelancerProfileUpdate).toHaveBeenCalledWith({
      where: { id: "fp-u1" },
      data: { lastAbuPhase: "B", lastAbuPhaseAt: expect.any(Date) },
    });
    expect(recordAudit).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("does nothing when the phase hasn't changed", async () => {
    freelancerProfileFindMany.mockResolvedValue([profile("u1", "A")]);
    invoiceModeFor.mockReturnValue("payroll");
    getFiscal.mockResolvedValue({});
    getUitzendStatus.mockResolvedValue({ phase: "A", weeksWorked: 10, hoursWorked: 300 });

    const result = await sweepAbuPhaseTransitions();

    expect(result.transitions).toHaveLength(0);
    expect(freelancerProfileUpdate).not.toHaveBeenCalled();
  });

  it("on a real transition: persists it, audits it, and mails both the freelancer and admin", async () => {
    freelancerProfileFindMany.mockResolvedValue([profile("u1", "A", "Jan de Vries")]);
    invoiceModeFor.mockReturnValue("payroll");
    getFiscal.mockResolvedValue({});
    getUitzendStatus.mockResolvedValue({ phase: "B", weeksWorked: 53, hoursWorked: 1700 });

    const result = await sweepAbuPhaseTransitions();

    expect(result.transitions).toEqual([{ userId: "u1", name: "Jan de Vries", from: "A", to: "B" }]);
    expect(freelancerProfileUpdate).toHaveBeenCalledWith({
      where: { id: "fp-u1" },
      data: { lastAbuPhase: "B", lastAbuPhaseAt: expect.any(Date) },
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "uitzend.abu_phase_transition", targetId: "u1" }),
    );
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "u1@example.com" }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "admin@zekerflex.com" }));
  });

  it("one freelancer's failure doesn't stop the sweep from checking the rest", async () => {
    freelancerProfileFindMany.mockResolvedValue([profile("u1", "A"), profile("u2", "A")]);
    invoiceModeFor.mockReturnValue("payroll");
    getFiscal.mockResolvedValue({});
    getUitzendStatus
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ phase: "B", weeksWorked: 60, hoursWorked: 1800 });

    const result = await sweepAbuPhaseTransitions();

    expect(result.transitions).toEqual([{ userId: "u2", name: "Jan", from: "A", to: "B" }]);
  });
});
