import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
const ledger = vi.hoisted(() => ({ bookWith: vi.fn(), transfer: vi.fn() }));
const db = vi.hoisted(() => ({ pots: [] as Record<string, unknown>[] }));

vi.mock("@/lib/storage/kv", () => ({
  kvFindByField: async (prefix: string, field: string, eq: string) =>
    [...kv.entries()].filter(([k, v]) => k.startsWith(prefix) && (v as Record<string, unknown>)?.[field] === eq).map(([, v]) => v),
  kvFindDue: async (prefix: string, field: string, before: string, after = "") =>
    [...kv.entries()]
      .filter(([k, v]) => k.startsWith(prefix) && k > after && String((v as Record<string, unknown>)?.[field] ?? "~") <= before)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, value]) => ({ key, value })),
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));
vi.mock("@/lib/bank/ledger", () => ledger);
vi.mock("@/lib/bank/accounts", () => ({ platformAccount: async () => ({ id: "platform" }) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankPot: {
      count: async () => db.pots.length,
      findFirst: async ({ where }: { where: { id: string } }) => db.pots.find((p) => p.id === where.id) ?? null,
      findMany: async () => db.pots,
      update: vi.fn(),
    },
  },
}));

import { interestFor, movePot, openDeposit, matureDeposits } from "@/lib/bank/pots";
import { activatePolicy, cancelPolicy, chargeDuePremiums, DEFAULT_PRODUCTS, requestPolicy, saveProducts, upcomingPremiums } from "@/lib/bank/insurance";

beforeEach(() => {
  kv.clear();
  db.pots = [];
  ledger.bookWith.mockReset().mockImplementation(async (_a: string, _b: unknown, alongside: (tx: unknown, e: unknown) => Promise<void>) => {
    await alongside({ bankPot: { create: async ({ data }: { data: object }) => ({ id: "pot1", ...data }), update: vi.fn(), updateMany: async () => ({ count: 1 }) } }, { created: true });
    return { created: true };
  });
  ledger.transfer.mockReset().mockResolvedValue({});
});

describe("deposits", () => {
  it("computes simple interest over the whole term", () => {
    expect(interestFor(100_000, 200, 3)).toBe(6_000); // € 1.000 × 2% × 3 jaar = € 60
  });

  it("opens a deposit at the configured rate and locks it for the term", async () => {
    const pot = await openDeposit({ accountId: "a", amountCents: 50_000, termYears: 5, requestKey: "k-12345678" });
    expect(pot).toMatchObject({ kind: "FIXED", balanceCents: 50_000, interestBps: 250, termYears: 5 });
    expect(new Date(pot.lockedUntil!).getUTCFullYear()).toBe(new Date().getUTCFullYear() + 5);
    expect(ledger.bookWith.mock.calls[0]![1]).toMatchObject({ amountCents: -50_000, kind: "POT_IN" });
  });

  it("refuses an unknown term and amounts under € 100", async () => {
    await expect(openDeposit({ accountId: "a", amountCents: 50_000, termYears: 4, requestKey: "k-12345678" })).rejects.toThrow("looptijd");
    await expect(openDeposit({ accountId: "a", amountCents: 9_999, termYears: 1, requestKey: "k-12345678" })).rejects.toThrow("€ 100");
  });

  it("can't be emptied or topped up before the end date", async () => {
    db.pots = [{ id: "d1", accountId: "a", kind: "FIXED", lockedUntil: new Date(Date.now() + 1e10), closedAt: null }];
    await expect(movePot({ potId: "d1", accountId: "a", direction: "out", amountCents: 100, requestKey: "k" })).rejects.toThrow("Vastgezet");
    await expect(movePot({ potId: "d1", accountId: "a", direction: "in", amountCents: 100, requestKey: "k" })).rejects.toThrow("bijstorten");
    expect(ledger.bookWith).not.toHaveBeenCalled();
  });

  it("at maturity pays interest from the platform and returns the money", async () => {
    db.pots = [{ id: "d1", accountId: "a", kind: "FIXED", balanceCents: 100_000, interestBps: 200, termYears: 3, name: "Deposito 3 jaar", lockedUntil: new Date(Date.now() - 1000), account: { holderName: "Liam" } }];
    expect(await matureDeposits()).toEqual({ matured: 1 });
    expect(ledger.transfer).toHaveBeenCalledWith(expect.objectContaining({ fromAccountId: "platform", toAccountId: "a", amountCents: 6_000, kind: "INTEREST", idempotencyKey: "interest:d1", allowNegative: true }));
    expect(ledger.bookWith.mock.calls[0]![1]).toMatchObject({ amountCents: 100_000, kind: "POT_OUT", idempotencyKey: "deposit-mature:d1" });
  });
});

describe("insurance", () => {
  const on = DEFAULT_PRODUCTS.map((p) => (p.id === "avb" ? { ...p, insurer: "Voorbeeld Verzekeringen N.V.", active: true } : p));

  it("a product can't go on without an insurer", async () => {
    await expect(saveProducts(DEFAULT_PRODUCTS.map((p) => (p.id === "avb" ? { ...p, active: true } : p)))).rejects.toThrow("verzekeraar");
  });

  it("only active products for the right audience can be requested, once", async () => {
    await expect(requestPolicy({ accountId: "a", holderName: "Liam", userId: "u", role: "personal", productId: "avb" })).rejects.toThrow("niet beschikbaar");
    await saveProducts(on);
    await requestPolicy({ accountId: "a", holderName: "Liam", userId: "u", role: "personal", productId: "avb" });
    await expect(requestPolicy({ accountId: "a", holderName: "Liam", userId: "u", role: "personal", productId: "avb" })).rejects.toThrow("loopt al");
  });

  it("activation collects the first premium; a failed one marks arrears and is retried by the cron", async () => {
    await saveProducts(on);
    const p = await requestPolicy({ accountId: "a", holderName: "Liam", userId: "u", role: "personal", productId: "avb" });
    ledger.transfer.mockRejectedValueOnce(new Error("Onvoldoende saldo"));
    const active = await activatePolicy(p.id, "POL-1");
    expect(active).toMatchObject({ status: "active", arrears: true, policyNumber: "POL-1" });
    const r = await chargeDuePremiums(new Date(Date.now() + 1000));
    expect(r).toEqual({ charged: 1, arrears: 0 });
    expect(ledger.transfer).toHaveBeenLastCalledWith(expect.objectContaining({ fromAccountId: "a", toAccountId: "platform", amountCents: 1495, kind: "INSURANCE_PREMIUM" }));
    expect((await upcomingPremiums("a", 40)).length).toBe(1);
  });

  it("after cancelling no premium is collected", async () => {
    await saveProducts(on);
    const p = await requestPolicy({ accountId: "a", holderName: "Liam", userId: "u", role: "personal", productId: "avb" });
    await activatePolicy(p.id, "POL-2");
    await cancelPolicy(p.id, "a");
    ledger.transfer.mockClear();
    expect(await chargeDuePremiums(new Date(Date.now() + 40 * 86_400_000))).toEqual({ charged: 0, arrears: 0 });
    expect(ledger.transfer).not.toHaveBeenCalled();
  });
});
