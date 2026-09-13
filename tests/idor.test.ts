import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/lib/auth";

// ---------------------------------------------------------------------------
// IDOR / cross-organisation isolation at the ROUTE level.
//
// auth-security.test.ts proves the assert* helpers in isolation; these tests
// prove that the real route handlers actually resolve a resource's owning
// tenant and refuse it when the caller belongs to a different organisation —
// i.e. "an employer of org A cannot reach org B's data by changing an id".
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  principal: null as Principal | null,
  scopeTenantIds: [] as string[],
  invoice: null as Record<string, unknown> | null,
  agreement: null as Record<string, unknown> | null,
  freelancerProfileMatch: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, requirePrincipal: async () => h.principal ?? actual.requirePrincipal() };
});

vi.mock("@/lib/dashboard/employer", () => ({
  resolveEmployerScope: async () => ({ tenantIds: h.scopeTenantIds, branchIds: null }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findUnique: async () => h.invoice,
      update: async () => ({}),
    },
    modelAgreement: { findUnique: async () => h.agreement },
    freelancerProfile: { findFirst: async () => h.freelancerProfileMatch },
  },
}));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/profile/store", () => ({ getOrgProfileExtra: async () => ({ billingEmail: null }) }));
vi.mock("@/lib/billing/stripe", () => ({
  createInvoiceCheckoutSession: async () => ({ id: "cs_test", url: "https://stripe.test/pay" }),
}));
vi.mock("@/lib/pdf/documents", () => ({
  invoicePdf: async () => ({ bytes: Buffer.from("%PDF-1.4"), filename: "factuur.pdf" }),
}));
vi.mock("@/lib/agreements/model-agreement", () => ({
  signModelAgreement: async () => ({ status: "ACTIVE" }),
}));

import { POST as checkoutPOST } from "@/app/api/invoices/[id]/checkout/route";
import { GET as pdfGET } from "@/app/api/invoices/[id]/pdf/route";
import { POST as signPOST } from "@/app/api/model-agreements/[id]/sign/route";

function employer(tenantId: string): Principal {
  return {
    userId: `usr_${tenantId}`,
    email: `a@${tenantId}.nl`,
    fullName: "Employer",
    emailVerifiedAt: new Date(),
    grants: [{ role: "HQ_ADMIN", organizationId: tenantId, locationIds: [] }],
    memberships: [{ tenantId, role: "HQ_ADMIN" }],
    managedBranchIds: [],
  } as Principal;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  h.principal = null;
  h.scopeTenantIds = [];
  h.invoice = null;
  h.agreement = null;
  h.freelancerProfileMatch = null;
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/invoices/[id]/checkout — pay someone else's invoice", () => {
  const invoiceOfB = {
    id: "inv_b",
    number: "ZF-SB-2026-000042",
    type: "SELF_BILL_FREELANCER",
    status: "ISSUED",
    totalCents: 12100,
    currency: "EUR",
    recipientTenantId: "org_b",
  };

  it("403s when the caller belongs to a different tenant", async () => {
    h.principal = employer("org_a");
    h.scopeTenantIds = ["org_a"];
    h.invoice = invoiceOfB;

    const res = await checkoutPOST(new Request("http://x/"), ctx("inv_b"));
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("stripe.test");
  });

  it("starts checkout for the tenant that actually owns the invoice", async () => {
    h.principal = employer("org_b");
    h.scopeTenantIds = ["org_b"];
    h.invoice = invoiceOfB;

    const res = await checkoutPOST(new Request("http://x/"), ctx("inv_b"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://stripe.test/pay" });
  });
});

describe("GET /api/invoices/[id]/pdf — read someone else's invoice", () => {
  it("403s a cross-tenant employer (no PDF bytes leak)", async () => {
    h.principal = employer("org_a");
    h.scopeTenantIds = ["org_a"];
    h.invoice = { recipientTenantId: "org_b", issuerFreelancerId: null };

    const res = await pdfGET(new Request("http://x/"), ctx("inv_b"));
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).not.toContain("application/pdf");
  });

  it("serves the PDF to the recipient tenant's employer", async () => {
    h.principal = employer("org_b");
    h.scopeTenantIds = ["org_b"];
    h.invoice = { recipientTenantId: "org_b", issuerFreelancerId: null };

    const res = await pdfGET(new Request("http://x/"), ctx("inv_b"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
  });
});

describe("POST /api/model-agreements/[id]/sign — sign someone else's agreement", () => {
  it("forbids a client-side signer from another organisation", async () => {
    h.principal = employer("org_a");
    h.agreement = { id: "ma_b", tenantId: "org_b", freelancer: { userId: "usr_freelancer" } };

    const res = await signPOST(new Request("http://x/"), ctx("ma_b"));
    expect(res.status).toBe(403);
  });

  it("lets the client organisation's HQ_ADMIN sign", async () => {
    h.principal = employer("org_b");
    h.agreement = { id: "ma_b", tenantId: "org_b", freelancer: { userId: "usr_freelancer" } };

    const res = await signPOST(new Request("http://x/"), ctx("ma_b"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ signedAs: "CLIENT" });
  });
});
