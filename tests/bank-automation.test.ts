import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
const m = vi.hoisted(() => ({
  alerts: [] as Record<string, unknown>[],
  frozenUpdates: 0,
  sendMail: vi.fn(),
  notify: vi.fn(),
  review: vi.fn(),
  owed: 0,
  held: 0,
}));

vi.mock("@/lib/storage/kv", () => ({ kvGet: async (k: string) => kv.get(k) ?? null, kvSet: async (k: string, v: unknown) => void kv.set(k, v) }));
vi.mock("@/lib/env", () => ({ env: { MAIL_ADMIN: "finance@zekerflex.test", APP_BASE_URL: "https://zf.test", STRIPE_SECRET_KEY: "sk_test", SEPA_CREDITOR_IBAN: "", SEPA_CREDITOR_NAME: "" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/mail", () => ({ sendMail: (...a: unknown[]) => m.sendMail(...a) }));
vi.mock("@/lib/bank/notify", () => ({ notifyBank: (...a: unknown[]) => m.notify(...a) }));
vi.mock("@/lib/bank/withdrawals", () => ({ exportPendingWithdrawals: vi.fn(), listWithdrawals: vi.fn() }));
vi.mock("@/lib/bank/monitoring", () => ({ scanAlerts: async () => m.alerts, reviewAlert: (...a: unknown[]) => m.review(...a) }));
vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: () => ({ balance: { retrieve: async () => ({ available: [{ currency: "eur", amount: m.held }], pending: [] }) } }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankAccount: {
      updateMany: async () => ({ count: m.frozenUpdates++ === 0 ? 1 : 0 }),
      aggregate: async () => ({ _sum: { balanceCents: m.owed } }),
    },
    bankPot: { aggregate: async () => ({ _sum: { balanceCents: 0 } }) },
  },
}));

import { autoRisk, coverageCheck, setAutoRisk } from "@/lib/bank/automation";

beforeEach(() => {
  kv.clear();
  m.alerts = [];
  m.frozenUpdates = 0;
  m.sendMail.mockReset().mockResolvedValue({});
  m.notify.mockReset();
  m.review.mockReset();
});

describe("automatic risk handling", () => {
  it("freezes on a severe unreviewed signal, tells holder and finance, and marks it for review", async () => {
    m.alerts = [
      { id: "pass:e1", accountId: "a9", holderName: "Mule", rule: "passthrough", title: "Doorsluizen", detail: "x", amountCents: 1_500_000 },
      { id: "large:e2", accountId: "a8", holderName: "Groot", rule: "large", title: "Groot bedrag", detail: "y", amountCents: 2_000_000 },
      { id: "pass:e3", accountId: "a7", holderName: "Klein", rule: "passthrough", title: "Doorsluizen", detail: "z", amountCents: 200_000 },
    ];
    expect(await autoRisk()).toEqual({ frozen: 1 });
    expect(m.review).toHaveBeenCalledWith("pass:e1", "Automaat", expect.stringContaining("voorlopig geblokkeerd"));
    expect(m.notify).toHaveBeenCalledWith("a9", "security", expect.any(String), expect.any(String));
    expect(m.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "finance@zekerflex.test" }));
  });

  it("does nothing when switched off", async () => {
    await setAutoRisk({ enabled: false, thresholdCents: 1 });
    m.alerts = [{ id: "pass:e1", accountId: "a9", holderName: "Mule", rule: "passthrough", title: "x", detail: "x", amountCents: 9_999_999 }];
    expect(await autoRisk()).toEqual({ frozen: 0 });
  });
});

describe("coverage check", () => {
  it("alerts finance once a day when Stripe holds less than customers own", async () => {
    m.owed = 100_000;
    m.held = 60_000;
    expect(await coverageCheck()).toEqual({ covered: false, shortfallCents: 40_000 });
    await coverageCheck();
    expect(m.sendMail).toHaveBeenCalledTimes(1);
  });

  it("is quiet when covered", async () => {
    m.owed = 50_000;
    m.held = 60_000;
    expect(await coverageCheck()).toEqual({ covered: true, shortfallCents: 0 });
    expect(m.sendMail).not.toHaveBeenCalled();
  });
});
