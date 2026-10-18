import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
const sendMoney = vi.hoisted(() => vi.fn());
const movePot = vi.hoisted(() => vi.fn());

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));
vi.mock("@/lib/bank/p2p", () => ({
  sendMoney: (...a: unknown[]) => sendMoney(...a),
  findByNumber: async (n: string) => (n.replace(/\s/g, "") === "ZF0000000002" ? { id: "a2", number: "ZF0000000002", holderName: "Huisbaas", ownerType: "USER" } : null),
}));
vi.mock("@/lib/bank/pots", () => ({ movePot: (...a: unknown[]) => movePot(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankAccount: { findUnique: async () => ({ id: "a1", frozenAt: null }) },
    bankPot: { findFirst: async () => ({ id: "pot1", emoji: "🏖️", name: "Vakantie" }) },
  },
}));

import { createStanding, listStanding, runStandingOrders, updateStanding } from "@/lib/bank/standing";
import { businessLevelFor } from "@/lib/rewards/business";

beforeEach(() => {
  kv.clear();
  sendMoney.mockReset().mockResolvedValue({ toHolder: "Huisbaas" });
  movePot.mockReset().mockResolvedValue(undefined);
});

describe("vaste opdrachten", () => {
  it("runs a due monthly transfer once and schedules the next month", async () => {
    const o = await createStanding({ accountId: "a1", target: { kind: "account", number: "ZF 00 0000 0002" }, amountCents: 5_000, description: "Huur", interval: "monthly", firstRun: new Date("2026-10-01T06:00:00Z") });
    expect(await runStandingOrders(new Date("2026-10-18T06:15:00Z"))).toEqual({ ran: 1, failed: 0 });
    expect(sendMoney).toHaveBeenCalledWith(expect.objectContaining({ toNumber: "ZF0000000002", amountCents: 5_000, requestKey: `standing-${o.id.slice(0, 8)}-2026-10-01` }));
    expect((await listStanding("a1"))[0]!.nextRunAt).toBe("2026-11-01T06:00:00.000Z");
    expect(await runStandingOrders(new Date("2026-10-19T06:15:00Z"))).toEqual({ ran: 0, failed: 0 });
  });

  it("saves weekly into an own pot", async () => {
    await createStanding({ accountId: "a1", target: { kind: "pot", potId: "pot1" }, amountCents: 1_000, description: "", interval: "weekly", firstRun: new Date("2026-10-18T06:00:00Z") });
    await runStandingOrders(new Date("2026-10-18T06:15:00Z"));
    expect(movePot).toHaveBeenCalledWith(expect.objectContaining({ potId: "pot1", direction: "in", amountCents: 1_000 }));
    expect((await listStanding("a1"))[0]!.nextRunAt).toBe("2026-10-25T06:00:00.000Z");
  });

  it("keeps a failed run due, shows why, and paused orders don't run", async () => {
    const o = await createStanding({ accountId: "a1", target: { kind: "account", number: "ZF0000000002" }, amountCents: 5_000, description: "", interval: "monthly", firstRun: new Date("2026-10-01T06:00:00Z") });
    sendMoney.mockRejectedValueOnce(new Error("Onvoldoende saldo"));
    expect(await runStandingOrders(new Date("2026-10-02T06:00:00Z"))).toEqual({ ran: 0, failed: 1 });
    const after = (await listStanding("a1"))[0]!;
    expect(after).toMatchObject({ nextRunAt: "2026-10-01T06:00:00.000Z", lastError: "Onvoldoende saldo" });
    await updateStanding(o.id, "a1", { active: false });
    expect(await runStandingOrders(new Date("2026-10-03T06:00:00Z"))).toEqual({ ran: 0, failed: 0 });
  });

  it("refuses unknown account numbers", async () => {
    await expect(createStanding({ accountId: "a1", target: { kind: "account", number: "ZF9999999999" }, amountCents: 100, description: "", interval: "monthly", firstRun: new Date() })).rejects.toThrow("bestaat niet");
  });
});

describe("partner levels", () => {
  it("maps completed klussen to a company level", () => {
    expect(businessLevelFor(0).level.id).toBe("starter");
    expect(businessLevelFor(25).level.id).toBe("partner");
    expect(businessLevelFor(600).level).toMatchObject({ id: "elite", feeDiscountPct: 50 });
    expect(businessLevelFor(5000)).toMatchObject({ next: null, progressPct: 100 });
  });
});
