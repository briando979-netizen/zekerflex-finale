import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
const transfer = vi.hoisted(() => vi.fn());

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
vi.mock("@/lib/bank/ledger", () => ({ transfer: (...a: unknown[]) => transfer(...a) }));
vi.mock("@/lib/bank/accounts", () => ({
  platformAccount: async () => ({ id: "platform" }),
  personalAccount: async (userId: string) => ({ id: `acc-${userId}`, holderName: userId }),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/reviews/store", () => ({ reviewSummary: async () => ({ average: 4.9, count: 6 }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: async ({ where }: { where: { id: string } }) => ({ fullName: `Naam ${where.id}` }) },
    freelancerProfile: { findUnique: async () => ({ id: "fp1" }) },
    timesheet: { count: async () => 12 },
    bankAccount: { findUnique: async () => ({ id: "b", _count: { pots: 1, cards: 0, entries: 3 } }) },
  },
}));

import { levelFor, rewardStatus } from "@/lib/rewards/levels";
import { codeFor, recordReferral, rewardReferral, referralStats } from "@/lib/rewards/referral";

beforeEach(() => {
  kv.clear();
  transfer.mockReset().mockResolvedValue({});
});

describe("levels", () => {
  it("maps XP to a level and progress", () => {
    expect(levelFor(0).level.id).toBe("starter");
    expect(levelFor(1500).level.id).toBe("zilver");
    expect(levelFor(2750)).toMatchObject({ progressPct: 50 });
    expect(levelFor(30_000)).toMatchObject({ next: null, progressPct: 100 });
  });

  it("computes XP and badges from real activity", async () => {
    const s = await rewardStatus("u1");
    // 12 klussen × 100 + 6 reviews × 25 + 500 topbeoordeeld + 100 bank + 50 potje
    expect(s!.xp).toBe(2000);
    expect(s!.level.id).toBe("zilver");
    expect(s!.badges.filter((b) => b.earned).map((b) => b.id)).toEqual(["first", "ten", "toprated", "banker", "saver"]);
  });
});

describe("referrals", () => {
  it("pays both bonuses once, only after the first real activity", async () => {
    const code = await codeFor("alice");
    expect(await codeFor("alice")).toBe(code);
    await recordReferral("bob", code);
    expect(await rewardReferral("bob", { id: "acc-bob", holderName: "Bob" } as never)).toBe(true);
    expect(transfer).toHaveBeenCalledTimes(2);
    expect(transfer).toHaveBeenCalledWith(expect.objectContaining({ fromAccountId: "platform", toAccountId: "acc-alice", amountCents: 2500, kind: "BONUS" }));
    expect(transfer).toHaveBeenCalledWith(expect.objectContaining({ toAccountId: "acc-bob", amountCents: 1000 }));
    expect(await rewardReferral("bob", null)).toBe(false);
    expect(transfer).toHaveBeenCalledTimes(2);
    expect(await referralStats("alice")).toEqual({ invited: 1, rewarded: 1, earnedCents: 2500 });
  });

  it("ignores self-referrals and unknown codes", async () => {
    const code = await codeFor("alice");
    await recordReferral("alice", code);
    await recordReferral("carol", "NOPE12");
    expect(await rewardReferral("alice", null)).toBe(false);
    expect(await rewardReferral("carol", null)).toBe(false);
    expect(transfer).not.toHaveBeenCalled();
  });
});
