import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ accounts: [] as { id: string; holderName: string; balanceCents: number }[], pots: [] as { id: string; accountId: string; balanceCents: number }[] }));
const movePot = vi.hoisted(() => vi.fn());
const transfer = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankAccount: { findMany: async () => db.accounts.filter((a) => a.balanceCents < 0) },
    bankPot: { findMany: async ({ where }: { where: { accountId: string } }) => db.pots.filter((p) => p.accountId === where.accountId && p.balanceCents > 0) },
  },
}));
vi.mock("@/lib/bank/pots", () => ({ movePot: (...a: unknown[]) => movePot(...a) }));
vi.mock("@/lib/bank/ledger", () => ({ transfer: (...a: unknown[]) => transfer(...a) }));
vi.mock("@/lib/bank/accounts", () => ({ platformAccount: async () => ({ id: "platform" }) }));
vi.mock("@/lib/bank/fees", () => ({ getFees: async () => ({ negativeBalanceFeeCents: 500 }) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { settleNegativeBalances } from "@/lib/bank/overdraft";

beforeEach(() => {
  db.accounts = [];
  db.pots = [];
  movePot.mockReset().mockResolvedValue(undefined);
  transfer.mockReset().mockResolvedValue({});
});

describe("keeping accounts positive", () => {
  it("does nothing when nobody is negative", async () => {
    db.accounts = [{ id: "a", holderName: "A", balanceCents: 100 }];
    expect(await settleNegativeBalances()).toEqual({ covered: 0, charged: 0 });
  });

  it("covers the gap from the holder's pots first, without a fee", async () => {
    db.accounts = [{ id: "a", holderName: "A", balanceCents: -300 }];
    db.pots = [{ id: "p1", accountId: "a", balanceCents: 1_000 }];
    expect(await settleNegativeBalances()).toEqual({ covered: 1, charged: 0 });
    expect(movePot).toHaveBeenCalledWith(expect.objectContaining({ potId: "p1", direction: "out", amountCents: 300 }));
    expect(transfer).not.toHaveBeenCalled();
  });

  it("charges the weekly fee when the pots aren't enough, once per week", async () => {
    db.accounts = [{ id: "a", holderName: "A", balanceCents: -800 }];
    db.pots = [{ id: "p1", accountId: "a", balanceCents: 200 }];
    const now = new Date("2026-10-19T08:00:00Z");
    expect(await settleNegativeBalances(now)).toEqual({ covered: 0, charged: 1 });
    expect(transfer).toHaveBeenCalledWith(expect.objectContaining({ fromAccountId: "a", toAccountId: "platform", amountCents: 500, allowNegative: true, idempotencyKey: "overdraft-fee:a:2026-W43" }));
  });
});
