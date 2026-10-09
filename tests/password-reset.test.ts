import { afterEach, describe, expect, it, vi } from "vitest";

// A locked-out account stayed locked out for the full 15-minute window even
// after successfully resetting its password — the mailed reset link proves
// account ownership exactly as well as a correct login would, but only a
// successful *login* cleared the throttle, which a locked account can never
// place. completePasswordReset() must clear it itself.
const userUpdate = vi.fn();
const tokenDelete = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: (...a: unknown[]) => userUpdate(...a) },
    passwordResetToken: { delete: (...a: unknown[]) => tokenDelete(...a) },
  },
}));

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const clearLoginFailures = vi.fn();
vi.mock("@/lib/auth/login-throttle", () => ({
  clearLoginFailures: (...a: unknown[]) => clearLoginFailures(...a),
}));

import { completePasswordReset } from "@/lib/auth/password-reset";

afterEach(() => vi.clearAllMocks());

describe("completePasswordReset", () => {
  it("clears the login-throttle lockout for the account's email on success", async () => {
    tokenDelete.mockResolvedValue({ userId: "u1", expiresAt: new Date(Date.now() + 60_000) });
    userUpdate.mockResolvedValue({ email: "Jan.VanLummel@Gmail.com" });

    const result = await completePasswordReset("a".repeat(24), "nieuwewachtwoord123");

    expect(result.ok).toBe(true);
    expect(clearLoginFailures).toHaveBeenCalledWith("jan.vanlummel@gmail.com");
  });

  it("does not touch the throttle when the token is invalid or expired", async () => {
    tokenDelete.mockRejectedValue(new Error("not found"));

    const result = await completePasswordReset("a".repeat(24), "nieuwewachtwoord123");

    expect(result.ok).toBe(false);
    expect(clearLoginFailures).not.toHaveBeenCalled();
  });

  it("does not touch the throttle when the new password is too short", async () => {
    const result = await completePasswordReset("a".repeat(24), "kort");

    expect(result.ok).toBe(false);
    expect(tokenDelete).not.toHaveBeenCalled();
    expect(clearLoginFailures).not.toHaveBeenCalled();
  });
});
