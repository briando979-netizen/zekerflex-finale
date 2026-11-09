import { afterEach, describe, expect, it, vi } from "vitest";

// A locked-out account stayed locked out for the full 15-minute window even
// after successfully resetting its password — the mailed reset link proves
// account ownership exactly as well as a correct login would, but only a
// successful *login* cleared the throttle, which a locked account can never
// place. completePasswordReset() must clear it itself.
const userUpdate = vi.fn();
const tokenDelete = vi.fn();
const tokenFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: (...a: unknown[]) => userUpdate(...a) },
    passwordResetToken: {
      delete: (...a: unknown[]) => tokenDelete(...a),
      findUnique: (...a: unknown[]) => tokenFindUnique(...a),
    },
  },
}));

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const clearLoginFailures = vi.fn();
vi.mock("@/lib/auth/login-throttle", () => ({
  clearLoginFailures: (...a: unknown[]) => clearLoginFailures(...a),
}));

// Sterkte en datalek-check: de echte check vraagt de pwnedpasswords-API, en een
// test mag nooit van internet afhangen.
const scorePassword = vi.fn();
const isBreached = vi.fn();
vi.mock("@/lib/auth/password", () => ({
  scorePassword: (...a: unknown[]) => scorePassword(...a),
  isBreached: (...a: unknown[]) => isBreached(...a),
}));

// Na een herstel gaan alle passkeys weg (lib/auth/passkey/beheer.ts, daar getest).
const wisPasskeysNaHerstel = vi.fn().mockResolvedValue(0);
vi.mock("@/lib/auth/passkey/beheer", () => ({ wisPasskeysNaHerstel: (...a: unknown[]) => wisPasskeysNaHerstel(...a) }));

import { completePasswordReset } from "@/lib/auth/password-reset";

const validToken = () => tokenFindUnique.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });

afterEach(() => vi.clearAllMocks());

describe("completePasswordReset", () => {
  it("clears the login-throttle lockout for the account's email on success", async () => {
    validToken();
    scorePassword.mockReturnValue({ score: 4, warnings: [] });
    isBreached.mockResolvedValue(false);
    tokenDelete.mockResolvedValue({ userId: "u1", expiresAt: new Date(Date.now() + 60_000) });
    userUpdate.mockResolvedValue({ email: "Jan.VanLummel@Gmail.com" });

    const result = await completePasswordReset("a".repeat(24), "nieuwewachtwoord123");

    expect(result.ok).toBe(true);
    expect(clearLoginFailures).toHaveBeenCalledWith("jan.vanlummel@gmail.com");
    // wie zijn account terugpakt, raakt ook een passkey kwijt die een ander er bij zette
    expect(wisPasskeysNaHerstel).toHaveBeenCalledWith("u1");
  });

  it("does not touch the throttle when the token is invalid or expired", async () => {
    tokenFindUnique.mockResolvedValue(null);

    const result = await completePasswordReset("a".repeat(24), "nieuwewachtwoord123");

    expect(result.ok).toBe(false);
    expect(tokenDelete).not.toHaveBeenCalled();
    expect(clearLoginFailures).not.toHaveBeenCalled();
    expect(wisPasskeysNaHerstel).not.toHaveBeenCalled();
  });

  it("does not touch the throttle when the new password is too short", async () => {
    const result = await completePasswordReset("a".repeat(24), "kort");

    expect(result.ok).toBe(false);
    expect(tokenDelete).not.toHaveBeenCalled();
    expect(clearLoginFailures).not.toHaveBeenCalled();
  });

  it("een zwak of uitgelekt wachtwoord verbruikt de herstellink niet", async () => {
    validToken();
    scorePassword.mockReturnValue({ score: 1, warnings: ["Te voorspelbaar."] });
    const weak = await completePasswordReset("a".repeat(24), "wachtwoord1");
    expect(weak).toEqual({ ok: false, reason: "Te voorspelbaar." });

    scorePassword.mockReturnValue({ score: 4, warnings: [] });
    isBreached.mockResolvedValue(true);
    const leaked = await completePasswordReset("a".repeat(24), "uitgelekt-maar-lang");
    expect(leaked.ok).toBe(false);

    // de link blijft bruikbaar voor een beter wachtwoord
    expect(tokenDelete).not.toHaveBeenCalled();
    expect(clearLoginFailures).not.toHaveBeenCalled();
  });
});
