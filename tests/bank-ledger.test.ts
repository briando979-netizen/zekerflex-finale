import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the three bank tables. $transaction snapshots the
// state and restores it when the callback throws, like a real rollback.
interface Acc {
  id: string;
  ownerType: "USER" | "TENANT" | "PLATFORM";
  holderName: string;
  balanceCents: number;
  frozenAt: Date | null;
  nextFeeAt: Date | null;
  payoutIban: string | null;
  payoutName: string | null;
}
interface Entry {
  id: string;
  accountId: string;
  amountCents: number;
  balanceAfterCents: number;
  kind: string;
  description: string;
  idempotencyKey: string;
  createdAt: Date;
}
const db = vi.hoisted(() => ({ accounts: new Map<string, Acc>(), entries: [] as Entry[], seq: 0 }));
const kv = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/prisma", () => {
  const prisma = {
    bankAccount: {
      findUnique: async ({ where }: { where: { id: string } }) => db.accounts.get(where.id) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const a = db.accounts.get(where.id);
        if (!a) throw new Error("not found");
        return a;
      },
      count: async ({ where }: { where: { id: string } }) => (db.accounts.has(where.id) ? 1 : 0),
      updateMany: async ({ where, data }: { where: { id: string; balanceCents?: { gte: number } }; data: { balanceCents: { increment: number } } }) => {
        const a = db.accounts.get(where.id);
        if (!a || (where.balanceCents && a.balanceCents < where.balanceCents.gte)) return { count: 0 };
        a.balanceCents += data.balanceCents.increment;
        return { count: 1 };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Acc> }) => Object.assign(db.accounts.get(where.id)!, data),
      findMany: async ({ where }: { where: { nextFeeAt: { lte: Date } } }) =>
        [...db.accounts.values()].filter((a) => a.ownerType !== "PLATFORM" && a.nextFeeAt && a.nextFeeAt <= where.nextFeeAt.lte),
    },
    bankEntry: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) => db.entries.find((e) => e.idempotencyKey === where.idempotencyKey) ?? null,
      create: async ({ data }: { data: Omit<Entry, "id" | "createdAt"> }) => {
        const e = { ...data, id: `e${++db.seq}`, createdAt: new Date() };
        db.entries.push(e);
        return e;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = { accounts: new Map([...db.accounts].map(([k, v]) => [k, { ...v }])), entries: [...db.entries] };
      try {
        return await fn(prisma);
      } catch (err) {
        db.accounts = snapshot.accounts;
        db.entries = snapshot.entries;
        throw err;
      }
    },
  };
  return { prisma };
});
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));
vi.mock("@/lib/bank/accounts", () => ({ platformAccount: async () => db.accounts.get("platform") }));
vi.mock("@/lib/env", () => ({ env: { SEPA_CREDITOR_IBAN: "NL91ABNA0417164300", SEPA_CREDITOR_NAME: "ZekerFlex B.V." } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { book, transfer } from "@/lib/bank/ledger";
import { chargeMonthlyFees, getFees, setFees, DEFAULT_FEES } from "@/lib/bank/fees";
import { requestWithdrawal, reverseWithdrawal, markWithdrawalPaid, exportPendingWithdrawals, listWithdrawals } from "@/lib/bank/withdrawals";

function acc(id: string, balanceCents: number, extra: Partial<Acc> = {}): Acc {
  const a: Acc = { id, ownerType: "USER", holderName: id, balanceCents, frozenAt: null, nextFeeAt: null, payoutIban: null, payoutName: null, ...extra };
  db.accounts.set(id, a);
  return a;
}

beforeEach(() => {
  db.accounts = new Map();
  db.entries = [];
  kv.clear();
  acc("platform", 0, { ownerType: "PLATFORM" });
});

describe("ledger", () => {
  it("credits and debits with a running balance", async () => {
    acc("a", 0);
    await book("a", { amountCents: 5000, kind: "TOPUP", description: "Opwaarderen", idempotencyKey: "t1" });
    const d = await book("a", { amountCents: -1200, kind: "ADJUSTMENT", description: "x", idempotencyKey: "t2" });
    expect(d.balanceAfterCents).toBe(3800);
    expect(db.accounts.get("a")!.balanceCents).toBe(3800);
  });

  it("refuses a debit larger than the balance and books nothing", async () => {
    acc("a", 1000);
    await expect(book("a", { amountCents: -1001, kind: "ADJUSTMENT", description: "x", idempotencyKey: "k" })).rejects.toThrow("Onvoldoende saldo");
    expect(db.accounts.get("a")!.balanceCents).toBe(1000);
    expect(db.entries).toHaveLength(0);
  });

  it("is idempotent: the same key books once", async () => {
    acc("a", 0);
    const first = await book("a", { amountCents: 2500, kind: "TOPUP", description: "x", idempotencyKey: "topup:cs_1" });
    const again = await book("a", { amountCents: 2500, kind: "TOPUP", description: "x", idempotencyKey: "topup:cs_1" });
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(db.accounts.get("a")!.balanceCents).toBe(2500);
  });

  it("blocks debits on a frozen account unless allowed, but still accepts credits", async () => {
    acc("a", 1000, { frozenAt: new Date() });
    await expect(book("a", { amountCents: -100, kind: "ADJUSTMENT", description: "x", idempotencyKey: "k1" })).rejects.toThrow("geblokkeerd");
    await book("a", { amountCents: 100, kind: "TOPUP", description: "x", idempotencyKey: "k2" });
    await book("a", { amountCents: -100, kind: "FEE_MONTHLY", description: "x", idempotencyKey: "k3" }, { allowFrozen: true });
    expect(db.accounts.get("a")!.balanceCents).toBe(1000);
  });

  it("transfers both legs or neither", async () => {
    acc("a", 500);
    acc("b", 0);
    await transfer({ fromAccountId: "a", toAccountId: "b", amountCents: 300, kind: "TRANSFER", description: "x", idempotencyKey: "tr1" });
    expect([db.accounts.get("a")!.balanceCents, db.accounts.get("b")!.balanceCents]).toEqual([200, 300]);
    await expect(transfer({ fromAccountId: "a", toAccountId: "missing", amountCents: 100, kind: "TRANSFER", description: "x", idempotencyKey: "tr2" })).rejects.toThrow();
    expect(db.accounts.get("a")!.balanceCents).toBe(200);
    expect(db.entries.filter((e) => e.idempotencyKey.startsWith("tr2"))).toHaveLength(0);
  });
});

describe("monthly fees", () => {
  it("charges due accounts to the platform once per period and moves nextFeeAt a month on", async () => {
    const due = new Date("2026-10-01T00:00:00Z");
    acc("p", 1000, { nextFeeAt: due });
    acc("t", 5000, { ownerType: "TENANT", nextFeeAt: due });
    acc("notyet", 1000, { nextFeeAt: new Date("2026-11-01T00:00:00Z") });
    const r = await chargeMonthlyFees(new Date("2026-10-17T00:00:00Z"));
    expect(r).toEqual({ charged: 2, skipped: 0 });
    expect(db.accounts.get("p")!.balanceCents).toBe(1000 - DEFAULT_FEES.monthlyPersonalCents);
    expect(db.accounts.get("t")!.balanceCents).toBe(5000 - DEFAULT_FEES.monthlyOrganisationCents);
    expect(db.accounts.get("platform")!.balanceCents).toBe(DEFAULT_FEES.monthlyPersonalCents + DEFAULT_FEES.monthlyOrganisationCents);
    expect(db.accounts.get("p")!.nextFeeAt!.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(db.accounts.get("notyet")!.balanceCents).toBe(1000);
  });

  it("never pushes an account negative — it retries later", async () => {
    acc("p", 50, { nextFeeAt: new Date("2026-10-01T00:00:00Z") });
    const r = await chargeMonthlyFees(new Date("2026-10-17T00:00:00Z"));
    expect(r).toEqual({ charged: 0, skipped: 1 });
    expect(db.accounts.get("p")!.balanceCents).toBe(50);
    expect(db.accounts.get("p")!.nextFeeAt!.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("uses the fees the admin saved", async () => {
    await setFees({ ...DEFAULT_FEES, monthlyPersonalCents: 0 });
    expect((await getFees()).monthlyPersonalCents).toBe(0);
  });
});

describe("withdrawals", () => {
  const withIban = { payoutIban: "NL20INGB0001234567", payoutName: "Liam Gold" };

  it("needs an IBAN first", async () => {
    acc("a", 5000);
    await expect(requestWithdrawal({ accountId: "a", amountCents: 1000, requestKey: "r1" })).rejects.toThrow("IBAN");
  });

  it("reserves the money immediately and a double click books once", async () => {
    acc("a", 5000, withIban);
    const w1 = await requestWithdrawal({ accountId: "a", amountCents: 2000, requestKey: "r1" });
    const w2 = await requestWithdrawal({ accountId: "a", amountCents: 2000, requestKey: "r1" });
    expect(w2.id).toBe(w1.id);
    expect(db.accounts.get("a")!.balanceCents).toBe(3000);
    expect(await listWithdrawals({ accountId: "a" })).toHaveLength(1);
  });

  it("can't withdraw more than the balance", async () => {
    acc("a", 500, withIban);
    await expect(requestWithdrawal({ accountId: "a", amountCents: 600, requestKey: "r" })).rejects.toThrow("Onvoldoende saldo");
  });

  it("exports pending ones as a SEPA batch, then paid ones can't be reversed", async () => {
    acc("a", 5000, withIban);
    const w = await requestWithdrawal({ accountId: "a", amountCents: 1500, requestKey: "r1" });
    const batch = await exportPendingWithdrawals();
    expect(batch.count).toBe(1);
    expect(batch.totalCents).toBe(1500);
    expect(batch.xml).toContain("NL20INGB0001234567");
    await markWithdrawalPaid(w.id);
    await expect(reverseWithdrawal(w.id, "x")).rejects.toThrow("Al uitbetaald");
  });

  it("reversing books the money back exactly once", async () => {
    acc("a", 5000, withIban);
    const w = await requestWithdrawal({ accountId: "a", amountCents: 1500, requestKey: "r1" });
    await reverseWithdrawal(w.id, "IBAN onjuist");
    await reverseWithdrawal(w.id, "IBAN onjuist");
    expect(db.accounts.get("a")!.balanceCents).toBe(5000);
  });
});
