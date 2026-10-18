import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));

import { base32Decode, base32Encode, counterAt, otpauthUrl, totpAt, verifyTotp } from "@/lib/auth/totp";
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  hasTwoFactor,
  mintLoginChallenge,
  openLoginChallenge,
  regenerateRecoveryCodes,
  twoFactorStatus,
  verifySecondFactor,
} from "@/lib/auth/two-factor";

// RFC 6238 appendix B: SHA1 secret = ASCII "12345678901234567890"
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it("matches the official test vectors (last 6 digits)", () => {
    expect(totpAt(RFC_SECRET, counterAt(59_000))).toBe("287082");
    expect(totpAt(RFC_SECRET, counterAt(1_111_111_109_000))).toBe("081804");
    expect(totpAt(RFC_SECRET, counterAt(1_234_567_890_000))).toBe("005924");
    expect(totpAt(RFC_SECRET, counterAt(2_000_000_000_000))).toBe("279037");
  });

  it("base32 round-trips", () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 9]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });

  it("accepts ±1 step of clock drift, nothing more", () => {
    const now = 1_700_000_000_000;
    const c = counterAt(now);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, c - 1), now)).toBe(c - 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, c + 1), now)).toBe(c + 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, c + 3), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12ab56", now)).toBeNull();
  });

  it("builds a standard otpauth link", () => {
    const u = otpauthUrl("JBSWY3DPEHPK3PXP", "a@b.nl");
    expect(u.startsWith("otpauth://totp/ZekerFlex%3Aa%40b.nl?")).toBe(true);
    expect(u).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(u).toContain("issuer=ZekerFlex");
  });
});

describe("two-step verification per user", () => {
  beforeEach(() => kv.clear());
  async function enable(userId = "u1") {
    const { secret } = await beginTwoFactorSetup(userId, "u1@zekerflex.nl");
    const r = await confirmTwoFactorSetup(userId, totpAt(secret, counterAt(Date.now())));
    if (!r.ok) throw new Error("setup failed");
    return { secret, recovery: r.recoveryCodes };
  }

  it("is only active after confirming a correct code; the secret is stored sealed", async () => {
    const { secret } = await beginTwoFactorSetup("u1", "u1@zekerflex.nl");
    expect(await hasTwoFactor("u1")).toBe(false);
    expect(await confirmTwoFactorSetup("u1", "000000")).toEqual({ ok: false });
    expect(JSON.stringify(kv.get("auth-2fa:u1"))).not.toContain(secret);
    const r = await confirmTwoFactorSetup("u1", totpAt(secret, counterAt(Date.now())));
    expect(r.ok).toBe(true);
    expect(await twoFactorStatus("u1")).toMatchObject({ enabled: true, recoveryLeft: 10 });
  });

  it("a code can't be used twice (replay)", async () => {
    const { secret } = await enable();
    const next = totpAt(secret, counterAt(Date.now()) + 1);
    expect((await verifySecondFactor("u1", next)).ok).toBe(true);
    expect((await verifySecondFactor("u1", next)).ok).toBe(false);
  });

  it("recovery codes work once, case/dash-insensitive, and are stored only as hashes", async () => {
    const { recovery } = await enable();
    const code = recovery[0]!;
    expect(JSON.stringify(kv.get("auth-2fa:u1"))).not.toContain(code);
    expect(await verifySecondFactor("u1", code.toLowerCase().replace("-", ""))).toEqual({ ok: true, usedRecovery: true });
    expect((await verifySecondFactor("u1", code)).ok).toBe(false);
    expect((await twoFactorStatus("u1")).recoveryLeft).toBe(9);
  });

  it("turning off or regenerating codes needs a valid code", async () => {
    const { secret, recovery } = await enable();
    expect(await disableTwoFactor("u1", "123456")).toBe(false);
    const fresh = await regenerateRecoveryCodes("u1", recovery[1]!);
    expect(fresh).toHaveLength(10);
    expect(await disableTwoFactor("u1", totpAt(secret, counterAt(Date.now()) + 1))).toBe(true);
    expect(await hasTwoFactor("u1")).toBe(false);
  });

  it("login challenge expires after 5 minutes and can't be forged", () => {
    const t = Date.now();
    const c = mintLoginChallenge("Liam@Freelancer.nl", t);
    expect(openLoginChallenge(c, t + 60_000)).toBe("liam@freelancer.nl");
    expect(openLoginChallenge(c, t + 6 * 60_000)).toBeNull();
    expect(openLoginChallenge(c.slice(0, -4) + "AAAA", t)).toBeNull();
    expect(openLoginChallenge("v1.nope.nope.nope", t)).toBeNull();
  });
});
