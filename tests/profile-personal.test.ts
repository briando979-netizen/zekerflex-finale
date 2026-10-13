import { afterEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();
const userUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
  },
}));

const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));

import { updatePersonalInfo } from "@/lib/profile/personal";

afterEach(() => vi.clearAllMocks());

describe("updatePersonalInfo", () => {
  it("throws when the user doesn't exist, without writing anything", async () => {
    userFindUnique.mockResolvedValue(null);
    await expect(updatePersonalInfo("ghost", { fullName: "Jan" })).rejects.toMatchObject({ status: 404 });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("updates fullName and phone, clearing phone to null when blank", async () => {
    userFindUnique.mockResolvedValue({ fullName: "Old Name", phone: "0612345678" });
    await updatePersonalInfo("u1", { fullName: "New Name", phone: "" });

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { fullName: "New Name", phone: null },
    });
  });

  it("records an audit entry noting which fields actually changed", async () => {
    userFindUnique.mockResolvedValue({ fullName: "Jan", phone: "0612345678" });
    await updatePersonalInfo("u1", { fullName: "Jan", phone: "0687654321" });

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.personal_info_updated",
        targetId: "u1",
        metadata: { fullNameChanged: false, phoneChanged: true },
      }),
    );
  });
});
