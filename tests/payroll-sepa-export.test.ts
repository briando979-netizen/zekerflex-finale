import { afterEach, describe, expect, it, vi } from "vitest";
import type { PayrollRun, PayslipRecord } from "@/lib/payroll/store";

const envMock = vi.hoisted(() => ({
  SEPA_CREDITOR_IBAN: undefined as string | undefined,
  SEPA_CREDITOR_NAME: "ZekerFlex B.V.",
}));
vi.mock("@/lib/env", () => ({ env: envMock }));

const freelancerFindMany = vi.fn();
const batchUpsert = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findMany: (...a: unknown[]) => freelancerFindMany(...a) },
    payrollSepaBatch: { upsert: (...a: unknown[]) => batchUpsert(...a) },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const getFiscal = vi.fn();
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: (...a: unknown[]) => getFiscal(...a) }));

import { generateSepaBatch } from "@/lib/payroll/sepa-export";

const NO_FISCAL = { iban: null, ibanPendingVerification: false };

const VALID_IBAN = "NL39RABO0300065264";

function payrollSlip(over: Partial<PayslipRecord> = {}): PayslipRecord {
  return {
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
    ...over,
  };
}

function run(payslips: PayslipRecord[]): PayrollRun {
  return {
    id: "2026-W35",
    isoWeek: "2026-W35",
    weekLabel: "Week 35 · 2026",
    status: "finalised",
    createdAt: new Date().toISOString(),
    createdBy: "admin",
    finalisedAt: new Date().toISOString(),
    finalisedBy: "admin",
    totals: {
      workers: payslips.length,
      payrollWorkers: payslips.length,
      invoiceWorkers: 0,
      grossCents: 0,
      payoutCents: payslips.reduce((s, p) => s + p.toPayCents, 0),
      fiscalIncomplete: 0,
    },
    payslips,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  envMock.SEPA_CREDITOR_IBAN = undefined;
});

describe("generateSepaBatch", () => {
  it("reports nothing to pay when there are no payroll-track workers", async () => {
    const result = await generateSepaBatch(run([]), "admin");
    expect(result.generated).toBe(false);
    expect(result.blockedReason).toMatch(/Geen payroll-werkers/);
    expect(batchUpsert).not.toHaveBeenCalled();
  });

  it("blocks with a clear reason, but does not throw, when SEPA_CREDITOR_IBAN is unset", async () => {
    const result = await generateSepaBatch(run([payrollSlip()]), "admin");
    expect(result.generated).toBe(false);
    expect(result.blockedReason).toMatch(/SEPA_CREDITOR_IBAN/);
    expect(batchUpsert).not.toHaveBeenCalled();
  });

  it("generates and persists a batch when config and IBANs are all in order", async () => {
    envMock.SEPA_CREDITOR_IBAN = "NL91ABNA0417164300";
    freelancerFindMany.mockResolvedValue([{ id: "fp1", payoutIban: VALID_IBAN, payoutIbanPendingVerification: false }]);
    batchUpsert.mockResolvedValue({});

    const result = await generateSepaBatch(run([payrollSlip()]), "admin");

    expect(result.generated).toBe(true);
    expect(result.lineCount).toBe(1);
    expect(result.totalCents).toBe(15000);
    expect(result.skipped).toEqual([]);
    expect(batchUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isoWeek: "2026-W35" },
        create: expect.objectContaining({ isoWeek: "2026-W35", lineCount: 1, totalCents: 15000 }),
      }),
    );
  });

  it("skips a worker with no IBAN on file instead of failing the whole batch", async () => {
    envMock.SEPA_CREDITOR_IBAN = "NL91ABNA0417164300";
    freelancerFindMany.mockResolvedValue([
      { id: "fp1", payoutIban: VALID_IBAN, payoutIbanPendingVerification: false },
      { id: "fp2", payoutIban: null, payoutIbanPendingVerification: false },
    ]);
    getFiscal.mockResolvedValue(NO_FISCAL);
    batchUpsert.mockResolvedValue({});

    const result = await generateSepaBatch(
      run([
        payrollSlip({ userId: "u1", freelancerId: "fp1", workerName: "Jan de Vries" }),
        payrollSlip({ userId: "u2", freelancerId: "fp2", workerName: "Marieke Jansen" }),
      ]),
      "admin",
    );

    expect(result.generated).toBe(true);
    expect(result.lineCount).toBe(1);
    expect(result.skipped).toEqual([
      expect.objectContaining({ userId: "u2", workerName: "Marieke Jansen" }),
    ]);
  });

  it("ignores a payroll worker with nothing left to pay (fully covered by an advance)", async () => {
    envMock.SEPA_CREDITOR_IBAN = "NL91ABNA0417164300";
    const result = await generateSepaBatch(run([payrollSlip({ toPayCents: 0 })]), "admin");
    expect(result.generated).toBe(false);
    expect(result.blockedReason).toMatch(/Geen payroll-werkers/);
    expect(freelancerFindMany).not.toHaveBeenCalled();
  });

  // Uitzendkrachten set their IBAN on /dashboard/verificatie (fiscal.iban),
  // not the zzp/flexwerker FreelancerProfile.payoutIban field — a worker who
  // only ever used that (the normal uitzend flow) must not be skipped as
  // "no IBAN" just because the profile field happens to be null.
  it("falls back to fiscal.iban when FreelancerProfile.payoutIban is null", async () => {
    envMock.SEPA_CREDITOR_IBAN = "NL91ABNA0417164300";
    freelancerFindMany.mockResolvedValue([{ id: "fp1", payoutIban: null, payoutIbanPendingVerification: false }]);
    getFiscal.mockResolvedValue({ iban: VALID_IBAN, ibanPendingVerification: false });
    batchUpsert.mockResolvedValue({});

    const result = await generateSepaBatch(run([payrollSlip()]), "admin");

    expect(result.generated).toBe(true);
    expect(result.lineCount).toBe(1);
    expect(getFiscal).toHaveBeenCalledWith("u1");
  });

  it("skips (and never calls getFiscal for) a worker whose profile IBAN is pending re-verification", async () => {
    envMock.SEPA_CREDITOR_IBAN = "NL91ABNA0417164300";
    freelancerFindMany.mockResolvedValue([{ id: "fp1", payoutIban: VALID_IBAN, payoutIbanPendingVerification: true }]);
    batchUpsert.mockResolvedValue({});

    const result = await generateSepaBatch(run([payrollSlip()]), "admin");

    expect(result.generated).toBe(false);
    expect(result.skipped).toEqual([
      expect.objectContaining({ userId: "u1", reason: expect.stringContaining("niet geverifieerd") }),
    ]);
    expect(getFiscal).not.toHaveBeenCalled();
  });

  it("skips a worker whose fiscal.iban (uitzend track) is pending re-verification", async () => {
    envMock.SEPA_CREDITOR_IBAN = "NL91ABNA0417164300";
    freelancerFindMany.mockResolvedValue([{ id: "fp1", payoutIban: null, payoutIbanPendingVerification: false }]);
    getFiscal.mockResolvedValue({ iban: VALID_IBAN, ibanPendingVerification: true });
    batchUpsert.mockResolvedValue({});

    const result = await generateSepaBatch(run([payrollSlip()]), "admin");

    expect(result.generated).toBe(false);
    expect(result.skipped).toEqual([
      expect.objectContaining({ userId: "u1", reason: expect.stringContaining("niet geverifieerd") }),
    ]);
  });
});
