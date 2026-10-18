import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
const db = vi.hoisted(() => ({ tenant: null as Record<string, unknown> | null, invoices: [] as Record<string, unknown>[] }));

vi.mock("@/lib/storage/kv", () => ({ kvGet: async (k: string) => kv.get(k) ?? null, kvSet: async (k: string, v: unknown) => void kv.set(k, v) }));
vi.mock("@/lib/prisma", () => ({ prisma: { tenant: { findUnique: async () => db.tenant }, invoice: { findMany: async () => db.invoices } } }));

import { acceptTerms, decideCredit, fastPayAvailable, getFastPay, hasAcceptedTerms, runCreditCheck, updateFastPay } from "@/lib/payouts/fastpay";

const now = new Date("2026-10-18T12:00:00Z");
const day = 86_400_000;
const paidOnTime = (i: number) => ({ status: "PAID", dueAt: new Date(now.getTime() - (40 + i) * day), paidAt: new Date(now.getTime() - (41 + i) * day), createdAt: new Date(now.getTime() - (300 + i) * day) });

beforeEach(() => {
  kv.clear();
  db.tenant = { kvkNumber: "12345678", companyRegistration: { isActive: true, insolvent: false, status: "ACTIVE" } };
  db.invoices = [];
});

describe("credit check for fast payout", () => {
  it("approves an active company that pays on time", async () => {
    db.invoices = Array.from({ length: 8 }, (_, i) => paidOnTime(i));
    const c = await runCreditCheck("t1", now);
    expect(c.status).toBe("approved");
    expect(c.score).toBe(100);
  });

  it("sends a new company without history to a human", async () => {
    expect((await runCreditCheck("t1", now)).status).toBe("review");
  });

  it("rejects insolvency and invoices more than 60 days overdue", async () => {
    db.tenant = { kvkNumber: "1", companyRegistration: { isActive: false, insolvent: true } };
    expect((await runCreditCheck("t1", now)).status).toBe("rejected");
    db.tenant = { kvkNumber: "1", companyRegistration: { isActive: true, insolvent: false } };
    db.invoices = [{ status: "ISSUED", dueAt: new Date(now.getTime() - 70 * day), paidAt: null, createdAt: new Date(now.getTime() - 100 * day) }];
    expect((await runCreditCheck("t1", now)).status).toBe("rejected");
  });

  it("is only available when switched on AND approved; an admin can decide a review case", async () => {
    const s = await updateFastPay("t1", { offerFastPay: true });
    expect(s.credit.status).toBe("review");
    expect(fastPayAvailable(s)).toBe(false);
    const approved = await decideCredit("t1", "approved", "Admin", "jaren klant, betaalt goed");
    expect(fastPayAvailable(approved)).toBe(true);
    expect(fastPayAvailable(await updateFastPay("t1", { offerFastPay: false }))).toBe(false);
  });

  it("keeps uitzend advances on by default, switchable", async () => {
    expect((await getFastPay("t9")).advancesForUitzend).toBe(true);
    expect((await updateFastPay("t9", { advancesForUitzend: false })).advancesForUitzend).toBe(false);
  });
});

describe("factoring terms", () => {
  it("records acceptance per terms version", async () => {
    expect(await hasAcceptedTerms("u1")).toBe(false);
    await acceptTerms("u1", "1.2.3.4", "Safari");
    expect(await hasAcceptedTerms("u1")).toBe(true);
  });
});
