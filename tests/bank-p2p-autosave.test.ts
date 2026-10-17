import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
const transfer = vi.hoisted(() => vi.fn());
const movePot = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({ accounts: [] as Record<string, unknown>[], sentToday: 0, pots: [] as Record<string, unknown>[] }));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));
vi.mock("@/lib/bank/ledger", () => ({ transfer: (...a: unknown[]) => transfer(...a) }));
vi.mock("@/lib/bank/pots", () => ({ movePot: (...a: unknown[]) => movePot(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankAccount: { findUnique: async ({ where }: { where: { number: string } }) => db.accounts.find((a) => a.number === where.number) ?? null },
    bankEntry: { aggregate: async () => ({ _sum: { amountCents: -db.sentToday } }) },
    bankPot: { findFirst: async ({ where }: { where: { id: string } }) => db.pots.find((p) => p.id === where.id) ?? null },
  },
}));

import { createRequest, payRequest, sendMoney, DAILY_SEND_LIMIT_CENTS } from "@/lib/bank/p2p";
import { applyEarningRule, applyRoundUp, setRules } from "@/lib/bank/autosave";
import type { BankAccount } from "@prisma/client";

const me = { id: "a1", holderName: "Liam", number: "ZF0000000001", ownerType: "USER", frozenAt: null } as unknown as BankAccount;
const other = { id: "a2", holderName: "Bakkerij", number: "ZF0000000002", ownerType: "TENANT", frozenAt: null } as unknown as BankAccount;

beforeEach(() => {
  kv.clear();
  db.accounts = [me, other] as unknown as Record<string, unknown>[];
  db.sentToday = 0;
  db.pots = [{ id: "pot1", accountId: "a1", kind: "POT", closedAt: null }];
  transfer.mockReset().mockResolvedValue({});
  movePot.mockReset().mockResolvedValue(undefined);
});

describe("sending money", () => {
  it("moves money to an account number, spaces allowed", async () => {
    expect(await sendMoney({ from: me, toNumber: "zf 00 0000 0002", amountCents: 1_500, description: "Lunch", requestKey: "k1234567" })).toEqual({ toHolder: "Bakkerij" });
    expect(transfer).toHaveBeenCalledWith(expect.objectContaining({ fromAccountId: "a1", toAccountId: "a2", amountCents: 1_500, kind: "TRANSFER", idempotencyKey: "send:a1:k1234567" }));
  });

  it("refuses unknown numbers, the own account and going over the daily limit", async () => {
    await expect(sendMoney({ from: me, toNumber: "ZF9999999999", amountCents: 100, description: "", requestKey: "k" })).rejects.toThrow("bestaat niet");
    await expect(sendMoney({ from: me, toNumber: "ZF0000000001", amountCents: 100, description: "", requestKey: "k" })).rejects.toThrow("eigen rekening");
    db.sentToday = DAILY_SEND_LIMIT_CENTS - 100;
    await expect(sendMoney({ from: me, toNumber: "ZF0000000002", amountCents: 101, description: "", requestKey: "k" })).rejects.toThrow("Daglimiet");
    expect(transfer).not.toHaveBeenCalled();
  });
});

describe("payment requests", () => {
  it("can be paid once by someone else", async () => {
    const r = await createRequest({ account: other, amountCents: 2_000, description: "Bijdrage" });
    await expect(payRequest(r.id, other)).rejects.toThrow("eigen verzoek");
    const paid = await payRequest(r.id, me);
    expect(paid).toMatchObject({ status: "paid", paidBy: "Liam" });
    expect(transfer).toHaveBeenCalledWith(expect.objectContaining({ fromAccountId: "a1", toAccountId: "a2", amountCents: 2_000, idempotencyKey: `request-pay:${r.id}` }));
    await expect(payRequest(r.id, me)).rejects.toThrow("al betaald");
  });
});

describe("automatic saving", () => {
  it("saves a share of each earnings credit", async () => {
    await setRules("a1", { earningPct: 30, earningPotId: "pot1", roundUp: false, roundUpPotId: null });
    expect(await applyEarningRule("a1", 10_000, "e1")).toBe(3_000);
    expect(movePot).toHaveBeenCalledWith(expect.objectContaining({ potId: "pot1", direction: "in", amountCents: 3_000, requestKey: "autosave-e1" }));
  });

  it("rounds card payments up to the next euro", async () => {
    await setRules("a1", { earningPct: 0, earningPotId: null, roundUp: true, roundUpPotId: "pot1" });
    expect(await applyRoundUp("a1", 340, "tx1")).toBe(60);
    expect(await applyRoundUp("a1", 500, "tx2")).toBe(0);
  });

  it("never blocks the payment when saving fails", async () => {
    await setRules("a1", { earningPct: 10, earningPotId: "pot1", roundUp: false, roundUpPotId: null });
    movePot.mockRejectedValueOnce(new Error("Onvoldoende saldo"));
    expect(await applyEarningRule("a1", 10_000, "e2")).toBe(0);
  });

  it("only accepts the holder's own pots", async () => {
    await expect(setRules("a1", { earningPct: 10, earningPotId: "someone-else", roundUp: false, roundUpPotId: null })).rejects.toThrow("potje");
  });
});
