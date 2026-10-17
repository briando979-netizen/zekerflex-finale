import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

// A tiny ledger stand-in: one account, a balance and the idempotency keys
// already booked — enough to check how card events move money.
const state = vi.hoisted(() => ({
  balance: 0,
  frozen: false,
  cardStatus: "active",
  keys: new Set<string>(),
  bookings: [] as { amountCents: number; kind: string; key: string }[],
}));
const kv = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankCard: {
      findUnique: async ({ where }: { where: { stripeCardId: string } }) =>
        where.stripeCardId === "ic_1" ? { id: "c1", accountId: "a1", stripeCardId: "ic_1", last4: "4242", status: state.cardStatus } : null,
      updateMany: vi.fn(),
    },
    bankAccount: {
      findUnique: async () => ({ id: "a1", frozenAt: state.frozen ? new Date() : null }),
    },
  },
}));
vi.mock("@/lib/bank/ledger", () => ({
  book: async (_id: string, b: { amountCents: number; kind: string; idempotencyKey: string }, opts: { allowNegative?: boolean } = {}) => {
    if (state.keys.has(b.idempotencyKey)) return { created: false };
    if (b.amountCents < 0 && !opts.allowNegative && state.balance < -b.amountCents) throw new Error("Onvoldoende saldo");
    state.keys.add(b.idempotencyKey);
    state.balance += b.amountCents;
    state.bookings.push({ amountCents: b.amountCents, kind: b.kind, key: b.idempotencyKey });
    return { created: true };
  },
  transfer: vi.fn(),
}));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
}));
vi.mock("@/lib/billing/stripe", () => ({ getStripeClient: vi.fn() }));
vi.mock("@/lib/bank/accounts", () => ({ platformAccount: vi.fn() }));
vi.mock("@/lib/bank/fees", () => ({ getFees: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { decideAuthorization, releaseHold, settleTransaction } from "@/lib/bank/cards";

const auth = (amount: number, extra: Record<string, unknown> = {}) =>
  ({ id: "iauth_1", card: { id: "ic_1" }, pending_request: { amount }, request_history: [], merchant_data: { name: "Albert Heijn" }, status: "pending", ...extra }) as unknown as Stripe.Issuing.Authorization;
const tx = (amount: number, id = "ipi_1", authorization: string | null = "iauth_1") =>
  ({ id, amount, card: "ic_1", authorization, merchant_data: { name: "Albert Heijn" } }) as unknown as Stripe.Issuing.Transaction;

beforeEach(() => {
  Object.assign(state, { balance: 10_000, frozen: false, cardStatus: "active", keys: new Set(), bookings: [] });
  kv.clear();
});

describe("card authorization against the ledger", () => {
  it("approves and holds the amount when the balance covers it", async () => {
    expect(await decideAuthorization(auth(2_500))).toEqual({ approved: true, reason: "ok" });
    expect(state.balance).toBe(7_500);
  });

  it("declines when the balance is too low, without booking", async () => {
    expect((await decideAuthorization(auth(20_000))).approved).toBe(false);
    expect(state.balance).toBe(10_000);
  });

  it("declines on a frozen account, a frozen card or an unknown card", async () => {
    state.frozen = true;
    expect((await decideAuthorization(auth(100))).reason).toBe("account_frozen");
    state.frozen = false;
    state.cardStatus = "inactive";
    expect((await decideAuthorization(auth(100))).reason).toBe("card_inactive");
    expect((await decideAuthorization(auth(100, { card: { id: "ic_other" } }))).reason).toBe("unknown_card");
    expect(state.balance).toBe(10_000);
  });
});

describe("settlement", () => {
  it("a capture equal to the hold costs nothing extra; closing releases nothing", async () => {
    await decideAuthorization(auth(2_500));
    await settleTransaction(tx(-2_500));
    await releaseHold(auth(0, { status: "closed" }));
    expect(state.balance).toBe(7_500);
  });

  it("a smaller capture releases the rest when the authorization closes", async () => {
    await decideAuthorization(auth(5_000)); // e.g. fuel pump pre-auth
    await settleTransaction(tx(-3_200));
    await releaseHold(auth(0, { status: "closed" }));
    expect(state.balance).toBe(6_800);
  });

  it("ends up right when the close arrives before the capture", async () => {
    await decideAuthorization(auth(2_000));
    await releaseHold(auth(0, { status: "closed" }));
    await settleTransaction(tx(-2_000));
    expect(state.balance).toBe(8_000);
  });

  it("a bigger capture (tip) is booked even past zero", async () => {
    state.balance = 2_000;
    await decideAuthorization(auth(2_000));
    await settleTransaction(tx(-2_300));
    expect(state.balance).toBe(-300);
  });

  it("a reversal gives the whole hold back, once", async () => {
    await decideAuthorization(auth(4_000));
    await releaseHold(auth(0, { status: "reversed" }));
    await releaseHold(auth(0, { status: "reversed" }));
    expect(state.balance).toBe(10_000);
  });

  it("a refund is credited, and a replayed event is booked once", async () => {
    await settleTransaction(tx(1_500, "ipi_refund", null));
    await settleTransaction(tx(1_500, "ipi_refund", null));
    expect(state.balance).toBe(11_500);
    expect(state.bookings.at(-1)?.kind).toBe("CARD_REFUND");
  });
});
