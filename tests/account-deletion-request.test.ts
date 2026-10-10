import { afterEach, describe, expect, it, vi } from "vitest";

// Self-service account deletion without being logged in — the Google Play
// "account deletion" web resource. Proves email ownership with a mailed
// one-time token (same pattern as password reset), then defers the actual
// erasure to the already-tested anonymizeUser().

const userFindFirst = vi.fn();
const tokenCreate = vi.fn();
const tokenDelete = vi.fn();
const fixedWindow = vi.fn();
const sendMail = vi.fn();
const anonymizeUser = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: (...a: unknown[]) => userFindFirst(...a) },
    accountDeletionToken: {
      create: (...a: unknown[]) => tokenCreate(...a),
      delete: (...a: unknown[]) => tokenDelete(...a),
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({ fixedWindow: (...a: unknown[]) => fixedWindow(...a) }));
vi.mock("@/lib/mail", () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
  accountDeletionEmail: (name: string, link: string) => ({ to: "", subject: "x", kind: "account-verwijdering-bevestiging", text: link, html: link }),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/privacy/anonymize", () => ({
  anonymizeUser: (...a: unknown[]) => anonymizeUser(...a),
}));

import { requestAccountDeletion, confirmAccountDeletion } from "@/lib/privacy/deletion-request";

afterEach(() => vi.clearAllMocks());

describe("requestAccountDeletion", () => {
  it("creates a token and mails it when the email belongs to a real account", async () => {
    fixedWindow.mockResolvedValue({ ok: true });
    userFindFirst.mockResolvedValue({ id: "u1", fullName: "Jan de Vries", email: "jan@example.nl" });
    tokenCreate.mockResolvedValue({});
    sendMail.mockResolvedValue({ delivered: true });

    await requestAccountDeletion("Jan@Example.nl");

    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "jan@example.nl", disabledAt: null } }),
    );
    expect(tokenCreate).toHaveBeenCalledOnce();
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "jan@example.nl" }));
  });

  it("does not enumerate — silently succeeds for an unknown email", async () => {
    fixedWindow.mockResolvedValue({ ok: true });
    userFindFirst.mockResolvedValue(null);

    await requestAccountDeletion("nobody@example.nl");

    expect(tokenCreate).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("is rate-limited per email and sends nothing once the window is exceeded", async () => {
    fixedWindow.mockResolvedValue({ ok: false });

    await requestAccountDeletion("jan@example.nl");

    expect(userFindFirst).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("confirmAccountDeletion", () => {
  it("erases the account behind a valid, unexpired token", async () => {
    tokenDelete.mockResolvedValue({ userId: "u1", expiresAt: new Date(Date.now() + 60_000) });
    anonymizeUser.mockResolvedValue({ userId: "u1", cleared: { account: 1 } });

    const result = await confirmAccountDeletion("a".repeat(24));

    expect(result.ok).toBe(true);
    expect(anonymizeUser).toHaveBeenCalledWith("u1", expect.objectContaining({ reason: expect.any(String) }));
  });

  it("rejects an expired token without erasing anything", async () => {
    tokenDelete.mockResolvedValue({ userId: "u1", expiresAt: new Date(Date.now() - 60_000) });

    const result = await confirmAccountDeletion("a".repeat(24));

    expect(result.ok).toBe(false);
    expect(anonymizeUser).not.toHaveBeenCalled();
  });

  it("rejects an unknown/already-used token without erasing anything", async () => {
    tokenDelete.mockRejectedValue(new Error("not found"));

    const result = await confirmAccountDeletion("a".repeat(24));

    expect(result.ok).toBe(false);
    expect(anonymizeUser).not.toHaveBeenCalled();
  });

  it("rejects a malformed token before touching the database", async () => {
    const result = await confirmAccountDeletion("too-short");

    expect(result.ok).toBe(false);
    expect(tokenDelete).not.toHaveBeenCalled();
    expect(anonymizeUser).not.toHaveBeenCalled();
  });
});
