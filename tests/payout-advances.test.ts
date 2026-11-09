import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  create: vi.fn(),
  updateMany: vi.fn(),
  sepa: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: { ADVANCE_FEE_RATE: 0.03, ADVANCE_MAX_RATE_OF_PENDING: 0.8, PAYROLL_ADVANCE_RATE_OF_GROSS: 0.5 } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/billing/sepa", () => ({
  // echte controlegetal-vorm is hier niet nodig; de routes zelf testen we elders
  isValidIban: (s: string) => /^NL\d{2}[A-Z]{4}\d{10}$/.test(s),
  triggerInstantPayout: (...a: unknown[]) => m.sepa(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    advanceRecord: {
      findMany: async () => m.rows,
      findFirst: async () => m.rows[0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        m.create(data);
        return { requestedAt: new Date("2026-11-09T10:00:00+01:00"), settledAt: null, paidAt: null, reconciledAt: null, reconciledNetCents: null, kind: null, isoWeek: null, timesheetId: null, expectedGrossCents: null, payoutStatus: null, providerRef: null, note: null, ...data };
      },
      updateMany: (...a: unknown[]) => m.updateMany(...a),
    },
  },
}));

import { advanceFee, createPayrollAdvance, maxAdvanceCents, outstandingAdvanceCents, reconcilePayrollAdvances, requestAdvance } from "@/lib/payouts/advances";

const row = (o: Record<string, unknown>) => ({
  id: "x", userId: "u1", amountCents: 0, feeCents: 0, netCents: 0, status: "approved", kind: "payroll", isoWeek: "2026-W45", timesheetId: null,
  expectedGrossCents: null, payoutStatus: "SETTLED", providerRef: null, note: null,
  requestedAt: new Date("2026-11-02T10:00:00+01:00"), settledAt: null, paidAt: new Date("2026-11-02T10:01:00+01:00"), reconciledAt: null, reconciledNetCents: null,
  ...o,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T10:00:00+01:00"));
  m.rows = [];
  m.sepa.mockReset().mockResolvedValue({ status: "SUBMITTED", providerRef: "sepa_1" });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("voorschotbedragen", () => {
  it("de vergoeding is 3% en wordt afgerond", () => {
    expect(advanceFee(10_000)).toBe(300);
    expect(advanceFee(1_001)).toBe(30);
  });

  it("het plafond is 80% van het openstaande bedrag min lopende voorschotten, nooit negatief", () => {
    expect(maxAdvanceCents(10_000, 0)).toBe(8_000);
    expect(maxAdvanceCents(10_000, 3_000)).toBe(5_000);
    expect(maxAdvanceCents(10_000, 9_000)).toBe(0);
    expect(maxAdvanceCents(0, 0)).toBe(0);
  });

  it("telt alleen aangevraagde en goedgekeurde voorschotten als openstaand", async () => {
    m.rows = [{ amountCents: 1_000 }, { amountCents: 2_500 }];
    expect(await outstandingAdvanceCents("u1")).toBe(3_500);
  });
});

describe("requestAdvance", () => {
  it("weigert minder dan 5 euro, ook na afronden", async () => {
    await expect(requestAdvance("u1", 499.4, 100_000)).rejects.toThrow("Minimaal € 5,00");
    expect(m.create).not.toHaveBeenCalled();
  });

  it("weigert boven het plafond en noemt het beschikbare bedrag", async () => {
    m.rows = [{ amountCents: 2_000 }]; // lopend voorschot
    // plafond = 80% van 10.000 - 2.000 = 6.000
    await expect(requestAdvance("u1", 6_001, 10_000)).rejects.toThrow("Maximaal € 60,00");
    expect(m.create).not.toHaveBeenCalled();
  });

  it("legt een geldige aanvraag vast met vergoeding en nettobedrag", async () => {
    const a = await requestAdvance("u1", 5_000, 10_000);
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", amountCents: 5_000, feeCents: 150, netCents: 4_850, status: "requested" }));
    expect(a).toMatchObject({ amountCents: 5_000, feeCents: 150, netCents: 4_850, status: "requested" });
  });

  it("precies op het plafond mag nog", async () => {
    const a = await requestAdvance("u1", 8_000, 10_000);
    expect(a.amountCents).toBe(8_000);
  });
});

describe("createPayrollAdvance", () => {
  const base = { userId: "u1", workerName: "Liam", timesheetId: "ts1", isoWeek: "2026-W45", expectedGrossCents: 40_000, creditorIban: "NL20INGB0001234567" };

  it("geeft null onder de 5 euro en doet geen uitbetaling", async () => {
    expect(await createPayrollAdvance({ ...base, expectedGrossCents: 900 })).toBeNull();
    expect(m.sepa).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("maakt per urenstaat maar één voorschot: een bestaand voorschot komt terug zonder tweede uitbetaling", async () => {
    m.rows = [row({ id: "bestaand", timesheetId: "ts1", amountCents: 20_000 })];
    const a = await createPayrollAdvance(base);
    expect(a?.id).toBe("bestaand");
    expect(m.sepa).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("betaalt 50% van het verwachte brutoloon minus 3% vergoeding en markeert het als goedgekeurd", async () => {
    const a = await createPayrollAdvance(base);
    // 50% van 40.000 = 20.000; vergoeding 600; netto 19.400
    expect(m.sepa).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 19_400, creditorIban: "NL20INGB0001234567", stripeConnectedAccountId: null }));
    expect(a).toMatchObject({ amountCents: 20_000, feeCents: 600, netCents: 19_400, status: "approved", kind: "payroll", payoutStatus: "SUBMITTED", isoWeek: "2026-W45" });
    expect(a?.paidAt).toBe("2026-11-09T09:00:00.000Z");
  });

  it("een mislukte uitbetaling blijft zichtbaar (FAILED) maar telt niet als betaald", async () => {
    m.sepa.mockRejectedValue(new Error("bank offline"));
    const a = await createPayrollAdvance(base);
    expect(a).toMatchObject({ status: "requested", payoutStatus: "FAILED" });
    expect(a?.paidAt).toBeUndefined();
    expect(a?.note).toMatch(/niet op je loon ingehouden/);
  });

  it("zonder geldig IBAN en zonder Stripe-rekening: geen uitbetaling, wel een FAILED-regel met uitleg", async () => {
    const a = await createPayrollAdvance({ ...base, creditorIban: "NL00BAD" });
    expect(m.sepa).not.toHaveBeenCalled();
    expect(a).toMatchObject({ status: "requested", payoutStatus: "FAILED" });
    expect(a?.note).toMatch(/Geen geldig IBAN/);
  });

  it("met een gekoppelde Stripe-rekening kan het ook zonder IBAN", async () => {
    const a = await createPayrollAdvance({ ...base, creditorIban: null, stripeConnectedAccountId: "acct_1" });
    expect(m.sepa).toHaveBeenCalledWith(expect.objectContaining({ stripeConnectedAccountId: "acct_1" }));
    expect(a?.status).toBe("approved");
  });
});

describe("reconcilePayrollAdvances", () => {
  it("telt de uitbetaalde voorschotten op en zet alleen de nog openstaande op verrekend", async () => {
    m.rows = [
      row({ id: "a", amountCents: 10_000, feeCents: 300, netCents: 9_700, status: "approved" }),
      row({ id: "b", amountCents: 5_000, feeCents: 150, netCents: 4_850, status: "settled" }),
    ];
    const r = await reconcilePayrollAdvances("u1", "2026-W45", 55_000);
    expect(r).toEqual({ grossCents: 15_000, netPaidCents: 14_550, feeCents: 450, count: 2 });
    expect(m.updateMany).toHaveBeenCalledTimes(1);
    expect(m.updateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: { in: ["a"] } },
      data: { status: "settled", reconciledNetCents: 55_000 },
    });
  });

  it("zonder voorschotten: nul en geen schrijfactie", async () => {
    expect(await reconcilePayrollAdvances("u1", "2026-W45", 55_000)).toEqual({ grossCents: 0, netPaidCents: 0, feeCents: 0, count: 0 });
    expect(m.updateMany).not.toHaveBeenCalled();
  });
});
