import { afterEach, describe, expect, it, vi } from "vitest";

const tenantFindFirst = vi.fn();
const apiSubscriptionUpsert = vi.fn().mockResolvedValue(undefined);
const apiSubscriptionFindUnique = vi.fn();
const apiSubscriptionUpdate = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findFirst: (...a: unknown[]) => tenantFindFirst(...a) },
    apiSubscription: {
      upsert: (...a: unknown[]) => apiSubscriptionUpsert(...a),
      findUnique: (...a: unknown[]) => apiSubscriptionFindUnique(...a),
      update: (...a: unknown[]) => apiSubscriptionUpdate(...a),
    },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const recordAudit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));

import { activateApiSubscription, syncApiSubscription, mapStripeSubscriptionStatus } from "@/lib/billing/api-subscription-sync";
import type Stripe from "stripe";

afterEach(() => vi.clearAllMocks());

describe("activateApiSubscription", () => {
  it("upserts an active ApiSubscription for the matched tenant", async () => {
    tenantFindFirst.mockResolvedValue({ id: "t1", name: "Acme BV" });
    const session = {
      id: "cs_1",
      metadata: { planKey: "starter" },
      customer: "cus_1",
      subscription: "sub_1",
    } as unknown as Stripe.Checkout.Session;

    await activateApiSubscription(session);

    expect(apiSubscriptionUpsert).toHaveBeenCalledWith({
      where: { tenantId: "t1" },
      create: { tenantId: "t1", planKey: "starter", status: "active", stripeSubscriptionId: "sub_1" },
      update: { planKey: "starter", status: "active", stripeSubscriptionId: "sub_1" },
    });
  });

  it("does nothing if planKey/customer/subscription metadata is missing", async () => {
    const session = { id: "cs_2", metadata: {}, customer: null, subscription: null } as unknown as Stripe.Checkout.Session;
    await activateApiSubscription(session);
    expect(apiSubscriptionUpsert).not.toHaveBeenCalled();
  });

  it("does nothing if no tenant matches the Stripe customer id", async () => {
    tenantFindFirst.mockResolvedValue(null);
    const session = { id: "cs_3", metadata: { planKey: "pro" }, customer: "cus_unknown", subscription: "sub_2" } as unknown as Stripe.Checkout.Session;
    await activateApiSubscription(session);
    expect(apiSubscriptionUpsert).not.toHaveBeenCalled();
  });
});

describe("mapStripeSubscriptionStatus", () => {
  it("maps active/trialing to active", () => {
    expect(mapStripeSubscriptionStatus("active")).toBe("active");
    expect(mapStripeSubscriptionStatus("trialing")).toBe("active");
  });
  it("maps past_due/unpaid to past_due", () => {
    expect(mapStripeSubscriptionStatus("past_due")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("unpaid")).toBe("past_due");
  });
  it("maps anything else (canceled, incomplete_expired, ...) to canceled", () => {
    expect(mapStripeSubscriptionStatus("canceled")).toBe("canceled");
    expect(mapStripeSubscriptionStatus("incomplete_expired")).toBe("canceled");
  });
});

describe("syncApiSubscription", () => {
  const subscription = {
    id: "sub_1",
    status: "active" as Stripe.Subscription.Status,
    metadata: { planKey: "pro" },
    items: { data: [{ current_period_end: 1_800_000_000 }] },
  } as unknown as Stripe.Subscription;

  it("does nothing for an unknown stripeSubscriptionId", async () => {
    apiSubscriptionFindUnique.mockResolvedValue(null);
    await syncApiSubscription(subscription, "customer.subscription.updated");
    expect(apiSubscriptionUpdate).not.toHaveBeenCalled();
  });

  it("updates status/plan/currentPeriodEnd on a lifecycle update", async () => {
    apiSubscriptionFindUnique.mockResolvedValue({ id: "sub_row_1", tenantId: "t1", planKey: "starter" });
    await syncApiSubscription(subscription, "customer.subscription.updated");
    expect(apiSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "sub_row_1" },
      data: { status: "active", planKey: "pro", currentPeriodEnd: new Date(1_800_000_000 * 1000) },
    });
  });

  it("forces status to canceled on a deletion event regardless of the Stripe status field", async () => {
    apiSubscriptionFindUnique.mockResolvedValue({ id: "sub_row_1", tenantId: "t1", planKey: "pro" });
    await syncApiSubscription(subscription, "customer.subscription.deleted");
    expect(apiSubscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "canceled" }) }),
    );
  });

  it("keeps the existing planKey when the Stripe subscription has no planKey metadata", async () => {
    apiSubscriptionFindUnique.mockResolvedValue({ id: "sub_row_1", tenantId: "t1", planKey: "starter" });
    const noMeta = { ...subscription, metadata: {} } as unknown as Stripe.Subscription;
    await syncApiSubscription(noMeta, "customer.subscription.updated");
    expect(apiSubscriptionUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ planKey: "starter" }) }));
  });
});
