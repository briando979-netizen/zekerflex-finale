import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const constructWebhookEvent = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({ constructWebhookEvent: (...a: unknown[]) => constructWebhookEvent(...a) }));

const claimIdempotency = vi.fn();
const releaseIdempotency = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/redis", () => ({
  claimIdempotency: (...a: unknown[]) => claimIdempotency(...a),
  releaseIdempotency: (...a: unknown[]) => releaseIdempotency(...a),
}));

const recordAudit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
vi.mock("@/lib/claims/fulfillment", () => ({ fulfillPaidClaim: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/billing/api-subscription-sync", () => ({
  activateApiSubscription: vi.fn().mockResolvedValue(undefined),
  syncApiSubscription: vi.fn().mockResolvedValue(undefined),
}));

const sendMail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/mail", () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
  mailShell: (title: string, body: string) => `<html>${title}${body}</html>`,
}));

const recipientsFor = vi.fn();
vi.mock("@/lib/billing/reminders", () => ({ recipientsFor: (...a: unknown[]) => recipientsFor(...a) }));

const recordChargeRefund = vi.fn().mockResolvedValue(undefined);
const recordDisputeOpened = vi.fn().mockResolvedValue(undefined);
const recordDisputeClosed = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/billing/clawback", () => ({
  recordChargeRefund: (...a: unknown[]) => recordChargeRefund(...a),
  recordDisputeOpened: (...a: unknown[]) => recordDisputeOpened(...a),
  recordDisputeClosed: (...a: unknown[]) => recordDisputeClosed(...a),
  settleClawbacks: vi.fn().mockResolvedValue(undefined),
}));

const subFindUnique = vi.fn();
const subUpdate = vi.fn();
const subUpdateMany = vi.fn();
const tenantFindUnique = vi.fn();
const freelancerUpdateMany = vi.fn();
const shopOrderFindUnique = vi.fn();
const shopOrderUpdateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiSubscription: {
      findUnique: (...a: unknown[]) => subFindUnique(...a),
      update: (...a: unknown[]) => subUpdate(...a),
      updateMany: (...a: unknown[]) => subUpdateMany(...a),
    },
    tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a) },
    freelancerProfile: { updateMany: (...a: unknown[]) => freelancerUpdateMany(...a) },
    shopOrder: {
      findUnique: (...a: unknown[]) => shopOrderFindUnique(...a),
      updateMany: (...a: unknown[]) => shopOrderUpdateMany(...a),
    },
    shopProductVariant: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    invoice: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

import { POST } from "@/app/api/webhooks/stripe/route";

function webhookReq() {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: "{}",
  });
}

/** Een abonnementsfactuur zoals Stripe hem stuurt (nieuwe API: het abonnement staat onder `parent`). */
function abonnementFactuur(extra: Record<string, unknown> = {}, metadata: Record<string, string> = {}) {
  return {
    id: "in_1",
    amount_due: 14900,
    attempt_count: 1,
    next_payment_attempt: 1_794_000_000,
    hosted_invoice_url: "https://invoice.stripe.com/i/test",
    parent: { type: "subscription_details", quote_details: null, subscription_details: { subscription: "sub_1", metadata } },
    ...extra,
  };
}

const SUB = { id: "apisub_1", tenantId: "tenant_1", planKey: "pro", status: "active", stripeSubscriptionId: "sub_1" };

beforeEach(() => {
  // Datums met zone: de klok staat vast, ook in UTC op de live-controle.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T10:00:00+01:00"));
  claimIdempotency.mockResolvedValue(true);
  recipientsFor.mockResolvedValue(["beheer@bedrijf.example"]);
  tenantFindUnique.mockResolvedValue({ name: "Bouwbedrijf Jansen" });
  subUpdate.mockResolvedValue({});
  subUpdateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("POST /api/webhooks/stripe — abonnement: invoice.payment_failed", () => {
  const event = () => ({ id: "evt_pf", type: "invoice.payment_failed", data: { object: abonnementFactuur() } });

  it("zet een actief abonnement op past_due, schrijft een auditregel en mailt de beheerders in het Nederlands", async () => {
    constructWebhookEvent.mockReturnValue(event());
    subFindUnique.mockResolvedValue(SUB);

    const res = await POST(webhookReq());
    expect(res.status).toBe(200);
    expect(subUpdate).toHaveBeenCalledWith({ where: { id: "apisub_1" }, data: { status: "past_due" } });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "api_subscription.past_due", targetId: "tenant_1" }));
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0]![0] as { to: string; subject: string; text: string };
    expect(mail.to).toBe("beheer@bedrijf.example");
    expect(mail.subject).toBe("Betaling van je ZekerFlex-abonnement mislukt");
    expect(mail.text).toContain("Bouwbedrijf Jansen");
    expect(mail.text).toContain("€ 149,00");
    expect(mail.text).toContain("https://invoice.stripe.com/i/test");
  });

  it("is idempotent: al past_due en een eerder verstuurde mail geven geen tweede update of mail", async () => {
    constructWebhookEvent.mockReturnValue(event());
    subFindUnique.mockResolvedValue({ ...SUB, status: "past_due" });
    claimIdempotency.mockImplementation(async (key: string) => !key.startsWith("abonnement-achterstand:"));

    expect((await POST(webhookReq())).status).toBe(200);
    expect(subUpdate).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("opent een geannuleerd abonnement niet opnieuw en mailt niet", async () => {
    constructWebhookEvent.mockReturnValue(event());
    subFindUnique.mockResolvedValue({ ...SUB, status: "canceled" });

    expect((await POST(webhookReq())).status).toBe(200);
    expect(subUpdate).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("slaat de mail over als de idempotentie-opslag uitvalt, maar zet de status wel", async () => {
    constructWebhookEvent.mockReturnValue(event());
    subFindUnique.mockResolvedValue(SUB);
    claimIdempotency.mockImplementation(async (key: string) => {
      if (key.startsWith("abonnement-achterstand:")) throw new Error("redis down");
      return true;
    });

    expect((await POST(webhookReq())).status).toBe(200);
    expect(subUpdate).toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("laat een onbekend abonnement, een factuur zonder abonnement en de eigen takken (website, netwerk) met rust", async () => {
    subFindUnique.mockResolvedValue(null);
    constructWebhookEvent.mockReturnValue(event());
    expect((await POST(webhookReq())).status).toBe(200);

    constructWebhookEvent.mockReturnValue({ id: "evt_pf2", type: "invoice.payment_failed", data: { object: abonnementFactuur({ parent: null }) } });
    expect((await POST(webhookReq())).status).toBe(200);

    for (const metadata of [{ managedWebsiteTenantId: "t1" }, { netwerkTenantId: "t2" }]) {
      subFindUnique.mockClear();
      constructWebhookEvent.mockReturnValue({ id: `evt_${Object.keys(metadata)[0]}`, type: "invoice.payment_failed", data: { object: abonnementFactuur({}, metadata) } });
      expect((await POST(webhookReq())).status).toBe(200);
      expect(subFindUnique).not.toHaveBeenCalled();
    }
    expect(subUpdate).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/stripe — abonnement: invoice.paid", () => {
  const event = () => ({ id: "evt_paid", type: "invoice.paid", data: { object: abonnementFactuur() } });

  it("herstelt een achterstallig abonnement naar actief met een auditregel", async () => {
    constructWebhookEvent.mockReturnValue(event());
    subFindUnique.mockResolvedValue({ ...SUB, status: "past_due" });

    expect((await POST(webhookReq())).status).toBe(200);
    expect(subUpdateMany).toHaveBeenCalledWith({ where: { id: "apisub_1", status: "past_due" }, data: { status: "active" } });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "api_subscription.recovered" }));
  });

  it("doet niets met een al actief abonnement (dubbel event) en heropent geen geannuleerd abonnement", async () => {
    constructWebhookEvent.mockReturnValue(event());
    for (const status of ["active", "canceled"]) {
      subFindUnique.mockResolvedValue({ ...SUB, status });
      expect((await POST(webhookReq())).status).toBe(200);
    }
    expect(subUpdateMany).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("schrijft geen tweede auditregel als een gelijktijdig event het herstel al deed", async () => {
    constructWebhookEvent.mockReturnValue(event());
    subFindUnique.mockResolvedValue({ ...SUB, status: "past_due" });
    subUpdateMany.mockResolvedValue({ count: 0 });

    expect((await POST(webhookReq())).status).toBe(200);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("raakt een gewone invoice.paid zonder abonnement niet aan", async () => {
    constructWebhookEvent.mockReturnValue({ id: "evt_paid2", type: "invoice.paid", data: { object: abonnementFactuur({ parent: null }) } });
    expect((await POST(webhookReq())).status).toBe(200);
    expect(subFindUnique).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/stripe — dubbele events", () => {
  it("verwerkt een tweede levering van hetzelfde event niet (duplicate)", async () => {
    constructWebhookEvent.mockReturnValue({ id: "evt_dup", type: "invoice.payment_failed", data: { object: abonnementFactuur() } });
    claimIdempotency.mockResolvedValueOnce(false);

    const res = await POST(webhookReq());
    expect((await res.json()).duplicate).toBe(true);
    expect(subFindUnique).not.toHaveBeenCalled();
  });

  it("zet bij uitgevallen idempotentie-opslag een al verwerkte shopbestelling niet nogmaals in gang", async () => {
    constructWebhookEvent.mockReturnValue({
      id: "evt_shop_dup",
      type: "checkout.session.completed",
      data: { object: { mode: "payment", payment_status: "paid", payment_intent: "pi_1", metadata: { shopOrderId: "order_1" } } },
    });
    claimIdempotency.mockRejectedValue(new Error("redis down"));
    shopOrderFindUnique.mockResolvedValue({ id: "order_1", status: "SHIPPED", itemsJson: [], totalCents: 1000 });
    shopOrderUpdateMany.mockResolvedValue({ count: 0 });

    expect((await POST(webhookReq())).status).toBe(200);
    expect(shopOrderUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "order_1", status: { in: ["PENDING_PAYMENT", "PAYMENT_FAILED", "CANCELLED"] } } }));
    expect(sendMail).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/stripe — terugbetaling, betwisting en Connect-account", () => {
  it.each([
    ["charge.refunded", recordChargeRefund],
    ["charge.dispute.created", recordDisputeOpened],
  ] as const)("%s gaat naar de storno-afhandeling", async (type, handler) => {
    const object = { id: "obj_1", payment_intent: "pi_1" };
    constructWebhookEvent.mockReturnValue({ id: `evt_${type}`, type, data: { object } });
    expect((await POST(webhookReq())).status).toBe(200);
    expect(handler).toHaveBeenCalledWith(object);
  });

  it("account.updated zet stripePayoutsEnabled bij een wijziging", async () => {
    constructWebhookEvent.mockReturnValue({ id: "evt_acct", type: "account.updated", data: { object: { id: "acct_1", payouts_enabled: true } } });
    freelancerUpdateMany.mockResolvedValue({ count: 1 });

    expect((await POST(webhookReq())).status).toBe(200);
    expect(freelancerUpdateMany).toHaveBeenCalledWith({
      where: { stripeConnectedAccountId: "acct_1", stripePayoutsEnabled: { not: true } },
      data: { stripePayoutsEnabled: true },
    });
  });

  it("account.updated zonder wijziging doet niets extra's en geeft 200 (idempotent)", async () => {
    constructWebhookEvent.mockReturnValue({ id: "evt_acct2", type: "account.updated", data: { object: { id: "acct_1", payouts_enabled: false } } });
    freelancerUpdateMany.mockResolvedValue({ count: 0 });

    expect((await POST(webhookReq())).status).toBe(200);
    expect(freelancerUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { stripePayoutsEnabled: false } }));
  });
});
