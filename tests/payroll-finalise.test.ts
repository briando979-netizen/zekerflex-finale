import { afterEach, describe, expect, it, vi } from "vitest";
import type { PayrollRun } from "@/lib/payroll/store";

// finaliseRun() used to just flip a status — no payment artifact at all.
// It now also generates the SEPA batch (lib/payroll/sepa-export.ts), but that
// must stay best-effort: a batch failure can never block the run itself from
// being marked definitive (that's a separate, independently-tested concern).

const acquireLock = vi.fn();
vi.mock("@/lib/redis", () => ({ acquireLock: (...a: unknown[]) => acquireLock(...a) }));

const getRun = vi.fn();
const saveRun = vi.fn();
vi.mock("@/lib/payroll/store", () => ({
  getRun: (...a: unknown[]) => getRun(...a),
  saveRun: (...a: unknown[]) => saveRun(...a),
}));

const reconcilePayrollAdvances = vi.fn();
vi.mock("@/lib/payouts/advances", () => ({
  payrollAdvancesForWeek: vi.fn().mockResolvedValue([]),
  reconcilePayrollAdvances: (...a: unknown[]) => reconcilePayrollAdvances(...a),
}));

const generateSepaBatch = vi.fn();
vi.mock("@/lib/payroll/sepa-export", () => ({
  generateSepaBatch: (...a: unknown[]) => generateSepaBatch(...a),
}));

vi.mock("@/lib/fiscal/store", () => ({ getFiscal: vi.fn(), invoiceModeFor: vi.fn(), isComplete: vi.fn() }));
vi.mock("@/lib/payroll/compute", () => ({ computePayslip: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: { timesheet: { findMany: vi.fn() } } }));

import { finaliseRun } from "@/lib/payroll/engine";

function draftRun(): PayrollRun {
  return {
    id: "2026-W35",
    isoWeek: "2026-W35",
    weekLabel: "Week 35 · 2026",
    status: "draft",
    createdAt: new Date().toISOString(),
    createdBy: "admin",
    finalisedAt: null,
    finalisedBy: null,
    totals: { workers: 1, payrollWorkers: 1, invoiceWorkers: 0, grossCents: 20000, payoutCents: 15000, fiscalIncomplete: 0 },
    payslips: [
      {
        userId: "u1",
        freelancerId: "fp1",
        workerName: "Jan de Vries",
        workerEmail: "jan@example.nl",
        workerKind: "uitzendkracht",
        isoWeek: "2026-W35",
        weekLabel: "Week 35 · 2026",
        weeksWorked: 3,
        fiscalComplete: true,
        computed: { breakdown: { kind: "payroll", grossCents: 20000 }, totalHours: 10, headlineCents: 15000 } as never,
        advance: null,
        toPayCents: 15000,
        generatedAt: new Date().toISOString(),
      },
    ],
  };
}

afterEach(() => vi.clearAllMocks());

describe("finaliseRun", () => {
  it("marks the run definitive and generates the SEPA batch", async () => {
    acquireLock.mockResolvedValue(vi.fn());
    getRun.mockResolvedValue(draftRun());
    saveRun.mockResolvedValue(undefined);
    reconcilePayrollAdvances.mockResolvedValue(undefined);
    generateSepaBatch.mockResolvedValue({ generated: true, totalCents: 15000, lineCount: 1, skipped: [] });

    const result = await finaliseRun("2026-W35", "admin");

    expect(result.run.status).toBe("finalised");
    expect(saveRun).toHaveBeenCalledWith(expect.objectContaining({ status: "finalised" }));
    expect(generateSepaBatch).toHaveBeenCalledWith(expect.objectContaining({ isoWeek: "2026-W35" }), "admin");
    expect(result.sepaBatch).toEqual({ generated: true, totalCents: 15000, lineCount: 1, skipped: [] });
  });

  it("still finalises the run when SEPA batch generation throws", async () => {
    acquireLock.mockResolvedValue(vi.fn());
    getRun.mockResolvedValue(draftRun());
    saveRun.mockResolvedValue(undefined);
    reconcilePayrollAdvances.mockResolvedValue(undefined);
    generateSepaBatch.mockRejectedValue(new Error("boom"));

    const result = await finaliseRun("2026-W35", "admin");

    expect(result.run.status).toBe("finalised");
    expect(result.sepaBatch).toMatchObject({ generated: false, blockedReason: "boom" });
  });

  it("is a no-op (no re-generated batch) when the run is already finalised", async () => {
    const already = { ...draftRun(), status: "finalised" as const };
    acquireLock.mockResolvedValue(vi.fn());
    getRun.mockResolvedValue(already);

    const result = await finaliseRun("2026-W35", "admin");

    expect(result.sepaBatch).toBeNull();
    expect(saveRun).not.toHaveBeenCalled();
    expect(generateSepaBatch).not.toHaveBeenCalled();
  });

  it("refuses a concurrent finalise for the same week", async () => {
    acquireLock.mockResolvedValue(null);
    await expect(finaliseRun("2026-W35", "admin")).rejects.toMatchObject({ status: 409 });
  });
});
