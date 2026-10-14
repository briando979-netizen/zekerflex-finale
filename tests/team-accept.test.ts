import { afterEach, describe, expect, it, vi } from "vitest";

const getTeamInvite = vi.fn();
const markTeamInviteAccepted = vi.fn();
const membershipFindFirst = vi.fn();
const userFindUnique = vi.fn();
const userCreate = vi.fn();
const membershipCreate = vi.fn();
const branchManagerCreateMany = vi.fn();
const txRunner = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({
    user: { create: (...a: unknown[]) => userCreate(...a) },
    membership: { create: (...a: unknown[]) => membershipCreate(...a) },
    branchManager: { createMany: (...a: unknown[]) => branchManagerCreateMany(...a) },
  }),
);

vi.mock("@/lib/team/invite", () => ({
  getTeamInvite: (...a: unknown[]) => getTeamInvite(...a),
  markTeamInviteAccepted: (...a: unknown[]) => markTeamInviteAccepted(...a),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: { findFirst: (...a: unknown[]) => membershipFindFirst(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    $transaction: (fn: (tx: unknown) => unknown) => txRunner(fn),
  },
}));

import { acceptTeamInviteForExistingUser, registerNewUserFromTeamInvite } from "@/lib/team/accept";

const PAYLOAD = {
  id: "i1",
  tenantId: "t1",
  tenantName: "Acme",
  email: "collega@example.com",
  role: "LOCAL_MANAGER" as const,
  branchIds: ["b1"],
  invitedByName: "Anna",
};

afterEach(() => vi.clearAllMocks());

describe("acceptTeamInviteForExistingUser", () => {
  it("rejects when the invite is no longer pending", async () => {
    getTeamInvite.mockResolvedValue({ status: "revoked" });
    await expect(acceptTeamInviteForExistingUser(PAYLOAD, "u1")).rejects.toThrow(/niet meer geldig/);
    expect(membershipCreate).not.toHaveBeenCalled();
  });

  it("creates a membership and attaches the invited branches", async () => {
    getTeamInvite.mockResolvedValue({ status: "pending" });
    membershipFindFirst.mockResolvedValue(null);
    membershipCreate.mockResolvedValue({ id: "m1" });

    await acceptTeamInviteForExistingUser(PAYLOAD, "u1");

    expect(membershipCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: "u1", tenantId: "t1", role: "LOCAL_MANAGER" } }),
    );
    expect(branchManagerCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ membershipId: "m1", branchId: "b1" }] }),
    );
    expect(markTeamInviteAccepted).toHaveBeenCalledWith("t1", "i1");
  });

  it("is idempotent when the membership already exists", async () => {
    getTeamInvite.mockResolvedValue({ status: "pending" });
    membershipFindFirst.mockResolvedValue({ id: "existing" });

    await acceptTeamInviteForExistingUser(PAYLOAD, "u1");

    expect(membershipCreate).not.toHaveBeenCalled();
    expect(markTeamInviteAccepted).toHaveBeenCalled();
  });
});

describe("registerNewUserFromTeamInvite", () => {
  it("rejects when the invite is no longer pending", async () => {
    getTeamInvite.mockResolvedValue({ status: "accepted" });
    await expect(registerNewUserFromTeamInvite(PAYLOAD, { fullName: "Jan", password: "x" })).rejects.toThrow(/niet meer geldig/);
  });

  it("refuses when an account for that e-mail already exists", async () => {
    getTeamInvite.mockResolvedValue({ status: "pending" });
    userFindUnique.mockResolvedValue({ id: "existing" });

    await expect(registerNewUserFromTeamInvite(PAYLOAD, { fullName: "Jan", password: "x" })).rejects.toThrow(/bestaat al/);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("creates a pre-verified user and attaches the membership + branches", async () => {
    getTeamInvite.mockResolvedValue({ status: "pending" });
    userFindUnique.mockResolvedValue(null);
    userCreate.mockResolvedValue({ id: "newuser1" });
    membershipCreate.mockResolvedValue({ id: "m1" });

    const result = await registerNewUserFromTeamInvite(PAYLOAD, { fullName: "Jan", password: "supersecret" });

    expect(result.userId).toBe("newuser1");
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "collega@example.com", emailVerifiedAt: expect.any(Date) }) }),
    );
    expect(membershipCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: "newuser1", tenantId: "t1", role: "LOCAL_MANAGER" } }),
    );
    expect(branchManagerCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ membershipId: "m1", branchId: "b1" }] }),
    );
    expect(markTeamInviteAccepted).toHaveBeenCalledWith("t1", "i1");
  });
});
