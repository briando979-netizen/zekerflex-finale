import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const kv = vi.hoisted(() => new Map<string, unknown>());
const push = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({ entries: [] as Record<string, unknown>[], account: { id: "a1", userId: "u1", tenantId: null, ownerType: "USER", balanceCents: 1_500 } as Record<string, unknown> }));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: (...a: unknown[]) => push(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/billing/stripe", () => ({ getStripeClient: vi.fn() }));
vi.mock("@/lib/bank/accounts", () => ({ platformAccount: vi.fn() }));
vi.mock("@/lib/bank/fees", () => ({ getFees: vi.fn() }));
vi.mock("@/lib/bank/ledger", () => ({ book: vi.fn(), transfer: vi.fn() }));
vi.mock("@/lib/bank/autosave", () => ({ applyRoundUp: vi.fn() }));
vi.mock("@/lib/rewards/levels", () => ({ rewardStatus: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankAccount: { findUnique: async () => db.account },
    bankEntry: { findMany: async () => db.entries },
    membership: { findMany: async () => [] },
  },
}));

import { controlViolation, DEFAULT_CONTROLS } from "@/lib/bank/cards";
import { checkLowBalance, notifyBank, recentNotes, setNotifyPrefs, DEFAULT_PREFS } from "@/lib/bank/notify";
import { scanAlerts } from "@/lib/bank/monitoring";

const auth = (o: Record<string, unknown>) => ({ authorization_method: "chip", merchant_data: { country: "NL", category: "grocery_stores_supermarkets" }, ...o }) as unknown as Stripe.Issuing.Authorization;

beforeEach(() => {
  kv.clear();
  push.mockReset().mockResolvedValue(1);
  db.entries = [];
  db.account = { id: "a1", userId: "u1", tenantId: null, ownerType: "USER", balanceCents: 1_500 };
});

describe("card controls", () => {
  it("blocks gambling by default, allows a normal shop", () => {
    expect(controlViolation(auth({}), DEFAULT_CONTROLS, 1_000)).toBeNull();
    expect(controlViolation(auth({ merchant_data: { country: "MT", category: "betting_casino_gambling" } }), DEFAULT_CONTROLS, 1_000)).toBe("gambling_blocked");
  });

  it("respects online, abroad and per-payment limit switches", () => {
    const strict = { online: false, abroad: false, gambling: false, perPaymentLimitCents: 5_000 };
    expect(controlViolation(auth({ authorization_method: "online" }), strict, 100)).toBe("online_blocked");
    expect(controlViolation(auth({ merchant_data: { country: "DE", category: "x" } }), strict, 100)).toBe("abroad_blocked");
    expect(controlViolation(auth({}), strict, 5_001)).toBe("over_payment_limit");
  });
});

describe("bank notifications", () => {
  it("pushes and keeps an in-app note, unless switched off", async () => {
    await notifyBank("a1", "incoming", "+€ 10,00 ontvangen", "Van Bob");
    expect(push).toHaveBeenCalledWith(["u1"], expect.objectContaining({ title: "+€ 10,00 ontvangen", data: expect.objectContaining({ url: "/dashboard/bank" }) }));
    expect(await recentNotes("a1")).toHaveLength(1);
    await setNotifyPrefs("a1", { ...DEFAULT_PREFS, incoming: false });
    await notifyBank("a1", "incoming", "x", "y");
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("warns about a low balance at most once a day", async () => {
    await checkLowBalance("a1"); // € 15 < € 20 default
    await checkLowBalance("a1");
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe("transaction monitoring", () => {
  const acc = { holderName: "Mule", createdAt: new Date("2026-10-15T00:00:00Z") };
  const now = new Date("2026-10-18T12:00:00Z");

  it("flags pass-through, large amounts and new-account volume", async () => {
    db.entries = [
      { id: "e1", accountId: "a9", amountCents: 600_000, kind: "TRANSFER", counterparty: "X", createdAt: new Date("2026-10-18T08:00:00Z"), account: acc },
      { id: "e2", accountId: "a9", amountCents: -550_000, kind: "WITHDRAWAL", counterparty: null, createdAt: new Date("2026-10-18T09:00:00Z"), account: acc },
    ];
    const rules = (await scanAlerts(now)).map((a) => a.rule).sort();
    expect(rules).toEqual(["large", "large", "new_account_volume", "passthrough"]);
  });

  it("flags many different senders in a day", async () => {
    db.entries = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, accountId: "a8", amountCents: 2_000, kind: "TRANSFER", counterparty: `Afzender ${i}`, createdAt: new Date("2026-10-18T10:00:00Z"), account: { holderName: "Veel", createdAt: new Date("2025-01-01") } }));
    expect((await scanAlerts(now)).map((a) => a.rule)).toEqual(["fan_in"]);
  });
});
