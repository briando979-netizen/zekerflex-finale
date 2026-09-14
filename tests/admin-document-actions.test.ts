import { afterEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/lib/auth";

// Bank statements (and anything else uploaded outside the self-serve
// identity flow) had no way to move from "uploaded" to approved/rejected —
// only the linked identity check could be resolved. This is the admin
// action for the rest of a freelancer's documents.
const requirePrincipal = vi.fn();
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requirePrincipal: () => requirePrincipal() };
});

const readDoc = vi.fn();
const setDocStatus = vi.fn();
vi.mock("@/lib/compliance/documents", () => ({
  readDoc: (...a: unknown[]) => readDoc(...a),
  setDocStatus: (...a: unknown[]) => setDocStatus(...a),
}));

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { POST } from "@/app/api/admin/gebruikers/[id]/documents/[docId]/route";

function admin(): Principal {
  return {
    userId: "admin1",
    email: "info@zekerflex.com",
    fullName: "Admin",
    emailVerifiedAt: new Date(),
    grants: [{ role: "PLATFORM_ADMIN", organizationId: "org_platform", locationIds: [] }],
    memberships: [],
    managedBranchIds: [],
  } as Principal;
}

function req(decision: string) {
  return new Request("http://localhost/api/admin/gebruikers/u1/documents/d1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision }),
  });
}

const ctx = { params: Promise.resolve({ id: "u1", docId: "d1" }) };

afterEach(() => vi.clearAllMocks());

describe("POST /api/admin/gebruikers/[id]/documents/[docId]", () => {
  it("approves a document", async () => {
    requirePrincipal.mockResolvedValue(admin());
    setDocStatus.mockResolvedValue({ id: "d1", kind: "bank", status: "approved" });

    const res = await POST(req("approve"), ctx);

    expect(res.status).toBe(200);
    expect(setDocStatus).toHaveBeenCalledWith("u1", "d1", "approved");
  });

  it("rejects a document", async () => {
    requirePrincipal.mockResolvedValue(admin());
    setDocStatus.mockResolvedValue({ id: "d1", kind: "bank", status: "rejected" });

    const res = await POST(req("reject"), ctx);

    expect(res.status).toBe(200);
    expect(setDocStatus).toHaveBeenCalledWith("u1", "d1", "rejected");
  });

  it("404s for a document that doesn't belong to this user", async () => {
    requirePrincipal.mockResolvedValue(admin());
    setDocStatus.mockResolvedValue(null);

    const res = await POST(req("approve"), ctx);

    expect(res.status).toBe(404);
  });

  it("refuses a non-admin caller", async () => {
    requirePrincipal.mockResolvedValue({
      userId: "u2",
      email: "freelancer@example.com",
      fullName: "F",
      emailVerifiedAt: new Date(),
      grants: [{ role: "FREELANCER", organizationId: "org_platform", locationIds: [] }],
      memberships: [],
      managedBranchIds: [],
    } as Principal);

    const res = await POST(req("approve"), ctx);

    expect(res.status).toBe(403);
    expect(setDocStatus).not.toHaveBeenCalled();
  });
});
