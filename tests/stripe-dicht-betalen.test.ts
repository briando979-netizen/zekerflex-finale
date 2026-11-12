import { afterEach, describe, expect, it, vi } from "vitest";

// Het live Stripe-account staat dicht (11 nov 2026): elke nieuwe betaling geeft dan een rustige 423 met code
// BETALEN_UIT en maakt géén Stripe-sessie aan (lib/billing/stripe-betalen.ts, eisBetalenAan).

const kv = vi.hoisted(() => new Map<string, unknown>());
const kvFout = vi.hoisted(() => ({ aan: false }));
const maakSessie = vi.hoisted(() => vi.fn(async () => ({ id: "cs_test_1", url: "https://stripe.test/pay" })));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => {
    if (kvFout.aan) throw new Error("kv onbereikbaar");
    return kv.get(k) ?? null;
  },
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvDelete: async (k: string) => void kv.delete(k),
}));
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { STRIPE_SECRET_KEY: "sk_test_x", APP_BASE_URL: "https://zekerflex.test" } }));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: maakSessie } };
  },
}));

import { AppError, toErrorBody } from "@/lib/errors";
import { createInvoiceCheckoutSession, createSubscriptionCheckoutSession } from "@/lib/billing/stripe";
import { BETALEN_UIT_KEY, eisBetalenAan } from "@/lib/billing/stripe-betalen";

const factuur = { invoiceId: "i1", number: "ZF-1", description: "Test", totalCents: 1000, currency: "EUR" };
const uit = () => kv.set(BETALEN_UIT_KEY, { tot: new Date(Date.now() + 60_000).toISOString(), op: new Date().toISOString(), melding: "charges_enabled=false" });

afterEach(() => {
  kv.clear();
  kvFout.aan = false;
  vi.clearAllMocks();
});

describe("betalen uit", () => {
  it("vlag aan: 423 met code BETALEN_UIT en rustige Nederlandse tekst, geen 403", async () => {
    uit();
    const err = await eisBetalenAan().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    const { status, body } = toErrorBody(err);
    expect(status).toBe(423);
    expect(body.error.code).toBe("BETALEN_UIT");
    expect(body.error.message).toBe("Betalen kan op dit moment even niet. Probeer het later opnieuw of neem contact op.");
  });

  it("een factuur betalen met de vlag aan: 423 en geen Stripe-aanroep", async () => {
    uit();
    await expect(createInvoiceCheckoutSession(factuur)).rejects.toMatchObject({ status: 423, code: "BETALEN_UIT" });
    expect(maakSessie).not.toHaveBeenCalled();
  });

  it("een abonnement met de vlag aan: ook 423 zonder Stripe-aanroep", async () => {
    uit();
    await expect(
      createSubscriptionCheckoutSession({ tenantId: "t1", planKey: "pro", email: "a@x.test" } as unknown as Parameters<typeof createSubscriptionCheckoutSession>[0]),
    ).rejects.toMatchObject({ status: 423 });
    expect(maakSessie).not.toHaveBeenCalled();
  });

  it("vlag uit: zoals nu, de sessie wordt gemaakt", async () => {
    const s = await createInvoiceCheckoutSession(factuur);
    expect(s.id).toBe("cs_test_1");
    expect(maakSessie).toHaveBeenCalledTimes(1);
  });

  it("een verlopen vlag telt niet meer mee", async () => {
    kv.set(BETALEN_UIT_KEY, { tot: new Date(Date.now() - 1000).toISOString(), op: "x", melding: "x" });
    await expect(eisBetalenAan()).resolves.toBeUndefined();
  });

  it("de KV even weg: de betaling gaat door (fail-open)", async () => {
    kvFout.aan = true;
    await expect(eisBetalenAan()).resolves.toBeUndefined();
    await createInvoiceCheckoutSession(factuur);
    expect(maakSessie).toHaveBeenCalledTimes(1);
  });
});
