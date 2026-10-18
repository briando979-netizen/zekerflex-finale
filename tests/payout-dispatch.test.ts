import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
const m = vi.hoisted(() => ({
  speed: "instant" as "instant" | "threeDay" | "standard",
  fastPay: true,
  terms: true,
  payment: null as Record<string, unknown> | null,
  sepa: vi.fn(),
  tsUpdate: vi.fn(),
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvDelete: async (k: string) => void kv.delete(k),
  kvFindDue: async (prefix: string, field: string, before: string, after = "") =>
    [...kv.entries()].filter(([k, v]) => k.startsWith(prefix) && k > after && String((v as Record<string, string>)[field]) <= before).map(([key, value]) => ({ key, value })),
}));
vi.mock("@/lib/payouts/preferences", () => ({
  getPayoutPrefs: async () => ({ speed: m.speed }),
  payoutFee: (c: number, s: string) => Math.round(c * (s === "instant" ? 0.04 : s === "threeDay" ? 0.02 : 0)),
}));
vi.mock("@/lib/payouts/fastpay", () => ({ getFastPay: async () => ({}), fastPayAvailable: () => m.fastPay, hasAcceptedTerms: async () => m.terms }));
vi.mock("@/lib/billing/sepa", () => ({ triggerInstantPayout: (...a: unknown[]) => m.sepa(...a) }));
vi.mock("@/lib/bank/earnings", () => ({ creditEarning: vi.fn(), getPayoutDestination: async () => "iban" }));
vi.mock("@/lib/bank/advance", () => ({ settleBankAdvances: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: {
      findUnique: async () => m.payment,
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(m.payment!, data),
    },
    timesheet: { update: (...a: unknown[]) => m.tsUpdate(...a) },
  },
}));

import { addWorkingDays, dispatchPayout, effectiveSpeed, payOnClientPayment, runScheduledPayouts } from "@/lib/payouts/execute";

const freshPayment = () => ({
  id: "pay1",
  status: "PENDING",
  amountCents: 10_000,
  creditorIban: "NL20INGB0001234567",
  endToEndId: "e2e",
  providerRef: null,
  invoice: { id: "inv1", number: "F-1", timesheet: { id: "ts1", freelancer: { userId: "u1", stripePayoutsEnabled: false, stripeConnectedAccountId: null, user: { fullName: "Liam" } }, branch: { tenant: { name: "Super BV" } } } },
});

beforeEach(() => {
  kv.clear();
  Object.assign(m, { speed: "instant", fastPay: true, terms: true, payment: freshPayment() });
  m.sepa.mockReset().mockResolvedValue({ status: "SETTLED", providerRef: "sepa_1", acceptedAt: new Date().toISOString() });
  m.tsUpdate.mockReset();
});

describe("which payout speed applies", () => {
  it("fast only with an approved client AND accepted terms", async () => {
    expect(await effectiveSpeed("u1", "t1")).toBe("instant");
    m.terms = false;
    expect(await effectiveSpeed("u1", "t1")).toBe("standard");
    m.terms = true;
    m.fastPay = false;
    expect(await effectiveSpeed("u1", "t1")).toBe("standard");
  });
});

describe("dispatching a payout", () => {
  it("instant: pays now minus 4% and marks the timesheet paid (not the client's invoice)", async () => {
    const r = await dispatchPayout({ paymentId: "pay1", invoiceId: "inv1", userId: "u1", tenantId: "t1", amountCents: 10_000 });
    expect(r).toMatchObject({ speed: "instant", status: "SETTLED" });
    expect(m.sepa).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 9_600 }));
    expect(m.tsUpdate).toHaveBeenCalledWith({ where: { id: "ts1" }, data: { status: "PAID" } });
  });

  it("three days: schedules, then the daily run pays minus 2% once", async () => {
    m.speed = "threeDay";
    const now = new Date("2026-10-16T10:00:00Z"); // Friday
    const r = await dispatchPayout({ paymentId: "pay1", invoiceId: "inv1", userId: "u1", tenantId: "t1", amountCents: 10_000, now });
    expect(r.dueAt).toBe("2026-10-21T10:00:00.000Z"); // Mon, Tue, Wed
    expect(m.sepa).not.toHaveBeenCalled();
    expect(await runScheduledPayouts(new Date("2026-10-20T10:00:00Z"))).toEqual({ paid: 0, failed: 0 });
    expect(await runScheduledPayouts(new Date("2026-10-21T12:00:00Z"))).toEqual({ paid: 1, failed: 0 });
    expect(m.sepa).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 9_800 }));
    expect(await runScheduledPayouts(new Date("2026-10-22T12:00:00Z"))).toEqual({ paid: 0, failed: 0 });
  });

  it("standard: waits for the client, then pays in full", async () => {
    m.speed = "standard";
    const r = await dispatchPayout({ paymentId: "pay1", invoiceId: "inv1", userId: "u1", tenantId: "t1", amountCents: 10_000 });
    expect(r).toMatchObject({ speed: "standard", status: "PENDING" });
    expect(m.sepa).not.toHaveBeenCalled();
    expect((await payOnClientPayment("inv1"))?.status).toBe("SETTLED");
    expect(m.sepa).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 10_000 }));
    expect(await payOnClientPayment("inv1")).toBeNull();
  });

  it("a failed transfer stays retryable", async () => {
    m.sepa.mockRejectedValueOnce(new Error("SEPA niet geconfigureerd"));
    const r = await dispatchPayout({ paymentId: "pay1", invoiceId: "inv1", userId: "u1", tenantId: "t1", amountCents: 10_000 });
    expect(r.status).toBe("FAILED");
    expect(m.payment!.status).toBe("FAILED");
  });
});

describe("working days", () => {
  it("skips weekends", () => {
    expect(addWorkingDays(new Date("2026-10-15T09:00:00Z"), 3).toISOString().slice(0, 10)).toBe("2026-10-20");
  });
});
