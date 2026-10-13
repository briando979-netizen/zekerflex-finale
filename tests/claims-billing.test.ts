import { afterEach, describe, expect, it, vi } from "vitest";

const tenantFindUnique = vi.fn();
const freelancerProfileFindUnique = vi.fn();
const invoiceCreate = vi.fn();
const invoiceUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a) },
    freelancerProfile: { findUnique: (...a: unknown[]) => freelancerProfileFindUnique(...a) },
    invoice: { update: (...a: unknown[]) => invoiceUpdate(...a) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn({ invoice: { create: (...a: unknown[]) => invoiceCreate(...a) } }),
  },
}));

const nextInvoiceNumber = vi.fn().mockResolvedValue("ZF-CP-2026-000001");
vi.mock("@/lib/billing/numbering", () => ({ nextInvoiceNumber: (...a: unknown[]) => nextInvoiceNumber(...a) }));

const createInvoiceCheckoutSession = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({ createInvoiceCheckoutSession: (...a: unknown[]) => createInvoiceCheckoutSession(...a) }));

const getOrgProfileExtra = vi.fn();
vi.mock("@/lib/profile/store", () => ({ getOrgProfileExtra: (...a: unknown[]) => getOrgProfileExtra(...a) }));

const attachClaimInvoice = vi.fn();
vi.mock("@/lib/claims/store", () => ({ attachClaimInvoice: (...a: unknown[]) => attachClaimInvoice(...a) }));

const sendMail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/mail", () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
  mailShell: (title: string, body: string) => `<html>${title}${body}</html>`,
  mailButton: (href: string, label: string) => `<a href="${href}">${label}</a>`,
}));

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { issueClaimInvoice } from "@/lib/claims/billing";
import type { CancellationClaim } from "@/lib/claims/store";

const BASE_CLAIM: CancellationClaim = {
  id: "claim1",
  direction: "freelancer_owed",
  shiftId: "s1",
  shiftTitle: "Horeca shift",
  assignmentId: "a1",
  freelancerUserId: "f1",
  freelancerName: "Jan",
  employerUserId: "e1",
  employerTenantId: "t1",
  branchName: "Vestiging A",
  shiftValueCents: 10_000,
  claimedCents: 5_000,
  reason: "x",
  status: "approved",
  filedAt: new Date().toISOString(),
  debtorUserId: "e1",
  debtorFreelancerId: null,
};

afterEach(() => vi.clearAllMocks());

describe("issueClaimInvoice", () => {
  it("refuses to invoice a claim twice", async () => {
    await expect(issueClaimInvoice({ ...BASE_CLAIM, invoiceId: "inv_existing" })).rejects.toMatchObject({ status: 409 });
  });

  it("bills the employer tenant for a freelancer_owed claim", async () => {
    tenantFindUnique.mockResolvedValue({ name: "Acme BV" });
    getOrgProfileExtra.mockResolvedValue({ billingEmail: "facturatie@acme.nl" });
    invoiceCreate.mockResolvedValue({ id: "inv_1", number: "ZF-CP-2026-000001", totalCents: 5_000, currency: "EUR" });
    createInvoiceCheckoutSession.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/cs_1" });

    const result = await issueClaimInvoice(BASE_CLAIM);

    expect(result).toEqual({ invoiceId: "inv_1", checkoutUrl: "https://checkout.stripe.com/cs_1" });
    expect(invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientTenantId: "t1",
          recipientFreelancerId: null,
          totalCents: 5_000,
        }),
      }),
    );
    expect(createInvoiceCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ billingEmail: "facturatie@acme.nl" }));
    expect(attachClaimInvoice).toHaveBeenCalledWith("claim1", "inv_1");
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "facturatie@acme.nl", kind: "annuleringsclaim-factuur" }));
  });

  it("bills the freelancer directly for an employer_owed claim", async () => {
    freelancerProfileFindUnique.mockResolvedValue({ user: { email: "piet@example.nl", fullName: "Piet" } });
    invoiceCreate.mockResolvedValue({ id: "inv_2", number: "ZF-CP-2026-000002", totalCents: 10_000, currency: "EUR" });
    createInvoiceCheckoutSession.mockResolvedValue({ id: "cs_2", url: "https://checkout.stripe.com/cs_2" });

    const claim: CancellationClaim = {
      ...BASE_CLAIM,
      id: "claim2",
      direction: "employer_owed",
      claimedCents: 10_000,
      debtorUserId: "f2",
      debtorFreelancerId: "fp2",
    };

    await issueClaimInvoice(claim);

    expect(invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipientTenantId: null, recipientFreelancerId: "fp2" }),
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "piet@example.nl" }));
  });
});
