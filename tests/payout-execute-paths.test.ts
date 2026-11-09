import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  payment: null as Record<string, unknown> | null,
  destination: "iban" as "iban" | "bank",
  sepa: vi.fn(),
  credit: vi.fn(),
  settleBank: vi.fn(),
  update: vi.fn(),
  tsUpdate: vi.fn(),
  alert: vi.fn(),
  revenue: vi.fn(),
  kvSet: vi.fn(),
}));

vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: (...a: unknown[]) => m.kvSet(...a), kvDelete: async () => undefined, kvFindDue: async () => [] }));
vi.mock("@/lib/payouts/preferences", () => ({ getPayoutPrefs: async () => ({ speed: "standard" }), payoutFee: () => 0 }));
vi.mock("@/lib/payouts/fastpay", () => ({ getFastPay: async () => ({}), fastPayAvailable: () => true, hasAcceptedTerms: async () => true }));
vi.mock("@/lib/billing/sepa", () => ({ triggerInstantPayout: (...a: unknown[]) => m.sepa(...a) }));
vi.mock("@/lib/bank/earnings", () => ({ creditEarning: (...a: unknown[]) => m.credit(...a), getPayoutDestination: async () => m.destination }));
vi.mock("@/lib/bank/advance", () => ({ settleBankAdvances: (...a: unknown[]) => m.settleBank(...a) }));
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: (...a: unknown[]) => m.alert(...a) }));
vi.mock("@/lib/admin/revenue-events", () => ({ recordRevenueEvent: (...a: unknown[]) => m.revenue(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: {
      findUnique: async () => m.payment,
      update: (...a: unknown[]) => m.update(...a),
    },
    timesheet: { update: (...a: unknown[]) => m.tsUpdate(...a) },
  },
}));

import { AppError } from "@/lib/errors";
import { executePayout } from "@/lib/payouts/execute";

const payment = (over: Record<string, unknown> = {}) => ({
  id: "pay1",
  status: "PENDING",
  amountCents: 10_000,
  creditorIban: "NL20INGB0001234567",
  endToEndId: "e2e",
  providerRef: null,
  invoice: { id: "inv1", number: "F-1", timesheet: { id: "ts1", freelancer: { userId: "u1", stripePayoutsEnabled: true, stripeConnectedAccountId: "acct_1", user: { fullName: "Liam" } }, branch: { tenant: { name: "Super BV" } } } },
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T10:00:00+01:00"));
  Object.assign(m, { payment: payment(), destination: "iban" });
  m.sepa.mockReset().mockResolvedValue({ status: "SETTLED", providerRef: "sepa_1", acceptedAt: "2026-11-09T09:00:05.000Z" });
  m.credit.mockReset().mockResolvedValue({ entry: { id: "e1" } });
  for (const f of [m.settleBank, m.update, m.tsUpdate, m.alert, m.kvSet]) f.mockReset();
  m.revenue.mockReset().mockResolvedValue(undefined);
});

describe("executePayout: paden", () => {
  it("onbekende betaling: 404", async () => {
    m.payment = null;
    await expect(executePayout("nope", { speed: "instant", feeCents: 0 })).rejects.toMatchObject({ status: 404 });
  });

  it.each(["SETTLED", "SUBMITTED"])("is idempotent: een betaling die al %s is wordt niet opnieuw uitbetaald", async (status) => {
    m.payment = payment({ status, providerRef: "al_betaald" });
    const r = await executePayout("pay1", { speed: "instant", feeCents: 400 });
    expect(r).toEqual({ status, providerRef: "al_betaald" });
    expect(m.sepa).not.toHaveBeenCalled();
    expect(m.credit).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });

  it("zonder urenstaat bij de factuur: 412, niets uitbetaald", async () => {
    m.payment = payment({ invoice: { id: "inv1", number: "F-1", timesheet: null } });
    await expect(executePayout("pay1", { speed: "standard", feeCents: 0 })).rejects.toMatchObject({ status: 412 });
    expect(m.sepa).not.toHaveBeenCalled();
  });

  it("IBAN-pad met Stripe-rekening: stuurt het nettobedrag en geeft de Stripe-rekening mee", async () => {
    const r = await executePayout("pay1", { speed: "instant", feeCents: 400 });
    expect(m.sepa).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 9_600, stripeConnectedAccountId: "acct_1", remittanceInfo: "ZekerFlex F-1" }));
    expect(r).toEqual({ status: "SETTLED", providerRef: "sepa_1" });
    expect(m.update.mock.calls[0]![0].data).toMatchObject({ status: "SETTLED", amountCents: 9_600, providerRef: "sepa_1" });
    expect(m.tsUpdate).toHaveBeenCalledWith({ where: { id: "ts1" }, data: { status: "PAID" } });
  });

  it("bij de vergoeding wordt die vastgelegd (KV) en als omzet geboekt", async () => {
    await executePayout("pay1", { speed: "instant", feeCents: 400 });
    expect(m.kvSet).toHaveBeenCalledWith("payout-fee:pay1", { speed: "instant", feeCents: 400, grossCents: 10_000 });
    expect(m.revenue).toHaveBeenCalledWith("fastpay", 400);
  });

  it("zonder vergoeding geen KV-regel en geen omzetboeking", async () => {
    await executePayout("pay1", { speed: "standard", feeCents: 0 });
    expect(m.kvSet).not.toHaveBeenCalled();
    expect(m.revenue).not.toHaveBeenCalled();
  });

  it("een vergoeding hoger dan het bedrag wordt begrensd: netto nooit negatief", async () => {
    await executePayout("pay1", { speed: "instant", feeCents: 99_999 });
    expect(m.sepa).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 0 }));
    expect(m.kvSet).toHaveBeenCalledWith("payout-fee:pay1", expect.objectContaining({ feeCents: 10_000 }));
  });

  it("negatieve vergoeding telt als nul", async () => {
    await executePayout("pay1", { speed: "standard", feeCents: -500 });
    expect(m.sepa).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 10_000 }));
  });

  it("een SUBMITTED-uitkomst zet de urenstaat nog niet op betaald", async () => {
    m.sepa.mockResolvedValue({ status: "SUBMITTED", providerRef: "sepa_2" });
    const r = await executePayout("pay1", { speed: "standard", feeCents: 0 });
    expect(r.status).toBe("SUBMITTED");
    expect(m.tsUpdate).not.toHaveBeenCalled();
    expect(m.update.mock.calls[0]![0].data.settledAt).toBeNull();
  });

  it("ZekerFlex-IBAN (ZF-voorvoegsel) gaat naar de bank, niet naar SEPA, en verrekent voorschotten", async () => {
    m.payment = payment({ creditorIban: "ZF00ZEKR0000000001" });
    const r = await executePayout("pay1", { speed: "instant", feeCents: 400 });
    expect(m.sepa).not.toHaveBeenCalled();
    expect(m.credit).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", amountCents: 9_600, idempotencyKey: "earning:inv1" }));
    expect(m.credit.mock.calls[0]![0].description).toContain("4,00");
    expect(m.settleBank).toHaveBeenCalledWith("u1", "Liam");
    expect(r).toEqual({ status: "SETTLED", providerRef: "zfbank:e1" });
  });

  it("uitbetalingsbestemming 'bank' gaat ook naar de bank bij een gewoon IBAN", async () => {
    m.destination = "bank";
    await executePayout("pay1", { speed: "standard", feeCents: 0 });
    expect(m.credit).toHaveBeenCalled();
    expect(m.sepa).not.toHaveBeenCalled();
  });

  it("een fout bij uitbetalen: betaling FAILED met kort foutbericht, eigenaar gewaarschuwd, geen uitzondering", async () => {
    m.sepa.mockRejectedValue(AppError.upstream("x".repeat(300)));
    const r = await executePayout("pay1", { speed: "standard", feeCents: 0 });
    expect(r).toEqual({ status: "FAILED", providerRef: null });
    const data = m.update.mock.calls.at(-1)![0].data;
    expect(data.status).toBe("FAILED");
    expect(String(data.failureCode).length).toBe(120);
    expect(m.alert).toHaveBeenCalledWith(expect.objectContaining({ key: "payout:pay1", title: "Uitbetaling mislukt" }));
    expect(m.tsUpdate).not.toHaveBeenCalled();
  });
});
