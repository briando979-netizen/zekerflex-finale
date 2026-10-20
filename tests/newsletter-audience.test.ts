import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "x".repeat(40), APP_BASE_URL: "https://www.zekerflex.com" } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: vi.fn(), kvSet: vi.fn(), kvListValues: vi.fn() }));

const { accountOptOutToken, verifyAccountOptOutToken } = await import("@/lib/newsletter/audience");

describe("account opt-out token", () => {
  it("round-trips the address", () => {
    const t = accountOptOutToken("jan@example.nl");
    expect(verifyAccountOptOutToken(t)).toBe("jan@example.nl");
  });

  it("rejects a token for another address with a reused signature", () => {
    const t = accountOptOutToken("jan@example.nl");
    const sig = t.split(".")[2];
    const forged = `u.${Buffer.from("piet@example.nl").toString("base64url")}.${sig}`;
    expect(verifyAccountOptOutToken(forged)).toBeNull();
  });

  it("ignores newsletter subscriber tokens", () => {
    expect(verifyAccountOptOutToken("abcdefghijklmnopqrstuvwxyz012345")).toBeNull();
  });
});
