import { afterEach, describe, expect, it, vi } from "vitest";

const profileFindUnique = vi.fn();
const invoiceFindMany = vi.fn();
const timesheetFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: (...a: unknown[]) => profileFindUnique(...a) },
    invoice: { findMany: (...a: unknown[]) => invoiceFindMany(...a) },
    timesheet: { findMany: (...a: unknown[]) => timesheetFindMany(...a) },
  },
}));

const getFiscal = vi.fn();
const invoiceModeFor = vi.fn();
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal: (...a: unknown[]) => getFiscal(...a),
  invoiceModeFor: (...a: unknown[]) => invoiceModeFor(...a),
}));

const getMileageLog = vi.fn();
vi.mock("@/lib/worker/mileage", () => ({ getMileageLog: (...a: unknown[]) => getMileageLog(...a) }));

import { annualSummaryPdf, getAnnualSummary } from "@/lib/worker/annual-summary";

afterEach(() => vi.clearAllMocks());

describe("getAnnualSummary", () => {
  it("telt omzet en btw per Amsterdams kwartaal, uren en opdrachtgevers", async () => {
    profileFindUnique.mockResolvedValue({ id: "fp1", user: { fullName: "Sanne de Vries" } });
    getFiscal.mockResolvedValue({ kvkNumber: "12345678", vatNumber: "NL001234567B01" });
    invoiceModeFor.mockReturnValue("reverse-billing");
    invoiceFindMany.mockResolvedValue([
      { subtotalCents: 10_000, vatCents: 2_100, createdAt: new Date("2026-02-10T10:00:00Z") },
      // 31 maart 23:30 UTC = 1 april in Amsterdam → kwartaal 2
      { subtotalCents: 20_000, vatCents: 4_200, createdAt: new Date("2026-03-31T23:30:00Z") },
      { subtotalCents: 5_000, vatCents: 0, createdAt: new Date("2026-11-01T10:00:00Z") },
    ]);
    timesheetFindMany.mockResolvedValue([
      { billableMinutes: 480, branch: { tenantId: "a" } },
      { billableMinutes: 450, branch: { tenantId: "a" } },
      { billableMinutes: 300, branch: { tenantId: "b" } },
    ]);
    getMileageLog.mockResolvedValue({ totals: { trips: 3, km: 120.5, amountCents: 2772 } });

    const r = await getAnnualSummary("u1", 2026);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const s = r.summary;
    expect(s.quarters.map((q) => q.revenueCents)).toEqual([10_000, 20_000, 0, 5_000]);
    expect(s.quarters.map((q) => q.vatCents)).toEqual([2_100, 4_200, 0, 0]);
    expect(s.revenueCents).toBe(35_000);
    expect(s.vatCents).toBe(6_300);
    expect(s.invoices).toBe(3);
    expect(s.hours).toBe(20.5);
    expect(s.shifts).toBe(3);
    expect(s.clients).toBe(2);
    expect(s.mileage).toEqual({ trips: 3, km: 120.5, amountCents: 2772 });

    const where = invoiceFindMany.mock.calls[0]![0].where;
    expect(where.type).toBe("SELF_BILL_FREELANCER");
    expect(where.createdAt.gte.toISOString()).toBe("2025-12-31T23:00:00.000Z");
  });

  it("geeft uitzendkrachten geen ondernemers-overzicht", async () => {
    profileFindUnique.mockResolvedValue({ id: "fp1", user: { fullName: "X" } });
    getFiscal.mockResolvedValue({});
    invoiceModeFor.mockReturnValue("payroll");
    expect(await getAnnualSummary("u1", 2026)).toEqual({ kind: "payroll" });
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });

  it("zonder profiel niets", async () => {
    profileFindUnique.mockResolvedValue(null);
    expect(await getAnnualSummary("u1", 2026)).toEqual({ kind: "no-profile" });
  });
});

describe("annualSummaryPdf", () => {
  it("maakt een geldige PDF", () => {
    const buf = annualSummaryPdf({
      year: 2026,
      name: "Sanne de Vries",
      kvkNumber: "12345678",
      vatNumber: null,
      quarters: [1, 2, 3, 4].map((quarter) => ({ quarter, revenueCents: 1_000_00, vatCents: 21_00, invoices: 1 })),
      revenueCents: 4_000_00,
      vatCents: 84_00,
      invoices: 4,
      hours: 1300,
      shifts: 160,
      clients: 5,
      mileage: { trips: 160, km: 3200, amountCents: 73_600 },
    });
    const text = buf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("Jaaroverzicht 2026");
    expect(text).toContain("privéauto");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });
});
