import { afterEach, describe, expect, it, vi } from "vitest";

const favoritePoolFindFirst = vi.fn();
const favoritePoolFindMany = vi.fn();
const favoritePoolCreate = vi.fn();
const favoritePoolUpdate = vi.fn();
const favoritePoolDelete = vi.fn();
const favoritePoolMemberUpsert = vi.fn();
const favoritePoolMemberDeleteMany = vi.fn();
const shiftPoolInviteFindFirst = vi.fn();
const shiftPoolInviteFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    favoritePool: {
      findFirst: (...a: unknown[]) => favoritePoolFindFirst(...a),
      findMany: (...a: unknown[]) => favoritePoolFindMany(...a),
      create: (...a: unknown[]) => favoritePoolCreate(...a),
      update: (...a: unknown[]) => favoritePoolUpdate(...a),
      delete: (...a: unknown[]) => favoritePoolDelete(...a),
    },
    favoritePoolMember: {
      upsert: (...a: unknown[]) => favoritePoolMemberUpsert(...a),
      deleteMany: (...a: unknown[]) => favoritePoolMemberDeleteMany(...a),
    },
    shiftPoolInvite: {
      findFirst: (...a: unknown[]) => shiftPoolInviteFindFirst(...a),
      findMany: (...a: unknown[]) => shiftPoolInviteFindMany(...a),
    },
  },
}));

import {
  listPools,
  createPool,
  renamePool,
  deletePool,
  addMember,
  removeMember,
  invitedPoolMemberUserIds,
  isInvitedToPoolOnlyShift,
  poolsInvitedToShift,
} from "@/lib/pools/store";

afterEach(() => vi.clearAllMocks());

describe("lib/pools/store", () => {
  it("createPool rejects a blank name without touching the database", async () => {
    await expect(createPool("t1", "   ")).rejects.toMatchObject({ message: expect.stringContaining("naam") });
    expect(favoritePoolCreate).not.toHaveBeenCalled();
  });

  it("createPool trims and caps the name length", async () => {
    favoritePoolCreate.mockResolvedValue({ id: "p1", name: "Horeca team A" });
    await createPool("t1", "  Horeca team A  ");
    expect(favoritePoolCreate).toHaveBeenCalledWith({
      data: { tenantId: "t1", name: "Horeca team A" },
      select: { id: true, name: true },
    });
  });

  it("renamePool/deletePool/addMember/removeMember all verify tenant ownership first", async () => {
    favoritePoolFindFirst.mockResolvedValue(null); // pool belongs to another tenant (or doesn't exist)

    await expect(renamePool("t1", "p1", "New name")).rejects.toMatchObject({ status: 404 });
    await expect(deletePool("t1", "p1")).rejects.toMatchObject({ status: 404 });
    await expect(addMember("t1", "p1", "fl1")).rejects.toMatchObject({ status: 404 });
    await expect(removeMember("t1", "p1", "fl1")).rejects.toMatchObject({ status: 404 });

    expect(favoritePoolUpdate).not.toHaveBeenCalled();
    expect(favoritePoolDelete).not.toHaveBeenCalled();
    expect(favoritePoolMemberUpsert).not.toHaveBeenCalled();
    expect(favoritePoolMemberDeleteMany).not.toHaveBeenCalled();

    // every ownership check scoped the lookup to THIS tenant
    for (const call of favoritePoolFindFirst.mock.calls) {
      expect(call[0]).toMatchObject({ where: { id: "p1", tenantId: "t1" } });
    }
  });

  it("addMember upserts (idempotent — adding an existing member is a no-op, not an error)", async () => {
    favoritePoolFindFirst.mockResolvedValue({ id: "p1" });
    await addMember("t1", "p1", "fl1");
    expect(favoritePoolMemberUpsert).toHaveBeenCalledWith({
      where: { poolId_freelancerUserId: { poolId: "p1", freelancerUserId: "fl1" } },
      create: { poolId: "p1", freelancerUserId: "fl1" },
      update: {},
    });
  });

  it("listPools scopes to the tenant and orders members by when they were added", async () => {
    favoritePoolFindMany.mockResolvedValue([{ id: "p1", name: "A", createdAt: new Date(), members: [] }]);
    await listPools("t1");
    expect(favoritePoolFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "t1" } }),
    );
  });

  it("invitedPoolMemberUserIds de-duplicates members across multiple invited pools", async () => {
    shiftPoolInviteFindMany.mockResolvedValue([
      { pool: { members: [{ freelancerUserId: "fl1" }, { freelancerUserId: "fl2" }] } },
      { pool: { members: [{ freelancerUserId: "fl2" }, { freelancerUserId: "fl3" }] } },
    ]);
    const ids = await invitedPoolMemberUserIds("shift1");
    expect(new Set(ids)).toEqual(new Set(["fl1", "fl2", "fl3"]));
    expect(ids).toHaveLength(3);
  });

  it("invitedPoolMemberUserIds returns an empty array for a shift with no invites", async () => {
    shiftPoolInviteFindMany.mockResolvedValue([]);
    expect(await invitedPoolMemberUserIds("shift1")).toEqual([]);
  });

  it("isInvitedToPoolOnlyShift is true only when the user is a member of an invited pool", async () => {
    shiftPoolInviteFindFirst.mockResolvedValueOnce({ id: "inv1" });
    expect(await isInvitedToPoolOnlyShift("shift1", "fl1")).toBe(true);

    shiftPoolInviteFindFirst.mockResolvedValueOnce(null);
    expect(await isInvitedToPoolOnlyShift("shift1", "fl-not-invited")).toBe(false);
  });

  it("poolsInvitedToShift returns the pool identity for display on the shift page", async () => {
    shiftPoolInviteFindMany.mockResolvedValue([{ pool: { id: "p1", name: "Horeca team A" } }]);
    expect(await poolsInvitedToShift("shift1")).toEqual([{ id: "p1", name: "Horeca team A" }]);
  });
});
