import { afterEach, describe, expect, it, vi } from "vitest";

const getPrincipal = vi.fn();
const requireRole = vi.fn();
const resolveEmployerScope = vi.fn();
const membershipFindMany = vi.fn();
const membershipFindFirst = vi.fn();
const membershipCount = vi.fn();
const membershipDelete = vi.fn();
const tenantFindUnique = vi.fn();
const branchCount = vi.fn();
const createTeamInvite = vi.fn();
const listPendingTeamInvites = vi.fn();
const getTeamInvite = vi.fn();
const revokeTeamInvite = vi.fn();
const sendMail = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/auth", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    requirePrincipal: async () => {
      const p = await getPrincipal();
      if (!p) throw AppError.unauthenticated();
      return p;
    },
    requireRole: (...a: unknown[]) => requireRole(...a),
  };
});
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: (...a: unknown[]) => resolveEmployerScope(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/mail", () => ({ sendMail: (...a: unknown[]) => sendMail(...a), teamInvitedEmail: vi.fn(() => ({ subject: "s", text: "t", html: "h", kind: "team-uitnodiging" })) }));
vi.mock("@/lib/team/invite", () => ({
  INVITABLE_ROLES: ["HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER"],
  createTeamInvite: (...a: unknown[]) => createTeamInvite(...a),
  listPendingTeamInvites: (...a: unknown[]) => listPendingTeamInvites(...a),
  getTeamInvite: (...a: unknown[]) => getTeamInvite(...a),
  revokeTeamInvite: (...a: unknown[]) => revokeTeamInvite(...a),
  teamInviteUrl: (t: string) => `https://app.example/uitnodiging/team?token=${t}`,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: {
      findMany: (...a: unknown[]) => membershipFindMany(...a),
      findFirst: (...a: unknown[]) => membershipFindFirst(...a),
      count: (...a: unknown[]) => membershipCount(...a),
      delete: (...a: unknown[]) => membershipDelete(...a),
    },
    tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a) },
    branch: { count: (...a: unknown[]) => branchCount(...a) },
  },
}));

import { GET, POST } from "@/app/api/werkgever/team/route";
import { DELETE as deleteMember } from "@/app/api/werkgever/team/[membershipId]/route";
import { DELETE as deleteInvite } from "@/app/api/werkgever/team/invites/[id]/route";

const PRINCIPAL = { userId: "u1", email: "a@b.nl", fullName: "Anna" };

function jsonReq(body: unknown) {
  return new Request("https://app.example/api/werkgever/team", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.clearAllMocks());

describe("GET /api/werkgever/team", () => {
  it("lists members and pending invites for the caller's tenant", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    membershipFindMany.mockResolvedValue([
      { id: "m1", role: "HQ_ADMIN", createdAt: new Date(), user: { id: "u1", fullName: "Anna", email: "a@b.nl" }, scopedBranches: [] },
    ]);
    listPendingTeamInvites.mockResolvedValue([{ id: "i1", email: "x@y.nl", role: "LOCAL_MANAGER", createdAt: new Date().toISOString() }]);

    const res = await GET();
    const body = await res.json();

    expect(body.members).toHaveLength(1);
    expect(body.invites).toHaveLength(1);
  });
});

describe("POST /api/werkgever/team", () => {
  it("rejects without HQ_ADMIN", async () => {
    const { AppError } = await import("@/lib/errors");
    getPrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => {
      throw AppError.forbidden("Requires HQ_ADMIN");
    });

    const res = await POST(jsonReq({ email: "x@y.nl", role: "LOCAL_MANAGER" }));
    expect(res.status).toBe(403);
    expect(createTeamInvite).not.toHaveBeenCalled();
  });

  it("refuses to invite someone already on the team", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    tenantFindUnique.mockResolvedValue({ name: "Acme" });
    membershipFindFirst.mockResolvedValue({ id: "existing" });

    const res = await POST(jsonReq({ email: "x@y.nl", role: "LOCAL_MANAGER" }));
    expect(res.status).toBe(409);
    expect(createTeamInvite).not.toHaveBeenCalled();
  });

  it("refuses LOCAL_MANAGER branches that don't belong to the tenant", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    tenantFindUnique.mockResolvedValue({ name: "Acme" });
    membershipFindFirst.mockResolvedValue(null);
    branchCount.mockResolvedValue(1); // only 1 of 2 requested branches actually belongs to t1

    const res = await POST(jsonReq({ email: "x@y.nl", role: "LOCAL_MANAGER", branchIds: ["b1", "b2"] }));
    expect(res.status).toBe(422);
    expect(createTeamInvite).not.toHaveBeenCalled();
  });

  it("creates the invite and e-mails it", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    tenantFindUnique.mockResolvedValue({ name: "Acme" });
    membershipFindFirst.mockResolvedValue(null);
    branchCount.mockResolvedValue(2);
    createTeamInvite.mockResolvedValue({ record: { id: "i1", email: "x@y.nl", role: "LOCAL_MANAGER" }, token: "tok" });

    const res = await POST(jsonReq({ email: "X@Y.nl", role: "LOCAL_MANAGER", branchIds: ["b1", "b2"] }));
    expect(res.status).toBe(201);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "x@y.nl" }));
  });
});

describe("DELETE /api/werkgever/team/:membershipId", () => {
  function delReq(id: string) {
    return deleteMember(new Request("https://app.example", { method: "DELETE" }), { params: Promise.resolve({ membershipId: id }) });
  }

  it("refuses to remove the last HQ_ADMIN", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    membershipFindFirst.mockResolvedValue({ id: "m1", role: "HQ_ADMIN", user: { email: "a@b.nl" } });
    membershipCount.mockResolvedValue(0);

    const res = await delReq("m1");
    expect(res.status).toBe(409);
    expect(membershipDelete).not.toHaveBeenCalled();
  });

  it("removes a HQ_ADMIN when another one remains", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    membershipFindFirst.mockResolvedValue({ id: "m1", role: "HQ_ADMIN", user: { email: "a@b.nl" } });
    membershipCount.mockResolvedValue(1);

    const res = await delReq("m1");
    expect(res.status).toBe(200);
    expect(membershipDelete).toHaveBeenCalledWith({ where: { id: "m1" } });
  });

  it("removes a LOCAL_MANAGER without checking the admin count", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    membershipFindFirst.mockResolvedValue({ id: "m2", role: "LOCAL_MANAGER", user: { email: "c@d.nl" } });

    const res = await delReq("m2");
    expect(res.status).toBe(200);
    expect(membershipCount).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/werkgever/team/invites/:id", () => {
  it("revokes a pending invite", async () => {
    getPrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    resolveEmployerScope.mockResolvedValue({ tenantIds: ["t1"], branchIds: null });
    getTeamInvite.mockResolvedValue({ id: "i1", email: "x@y.nl", status: "pending" });

    const res = await deleteInvite(new Request("https://app.example", { method: "DELETE" }), { params: Promise.resolve({ id: "i1" }) });
    expect(res.status).toBe(200);
    expect(revokeTeamInvite).toHaveBeenCalledWith("t1", "i1");
  });
});
