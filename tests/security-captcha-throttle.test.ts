import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "test-secret-at-least-32-chars-long!!", CAPTCHA_PROVIDER: undefined as string | undefined, CAPTCHA_SECRET: undefined, CAPTCHA_SITE_KEY: undefined } }));

import { env } from "@/lib/env";
import { createHash } from "node:crypto";
import { issuePowChallenge, verifyCaptcha, verifyPow } from "@/lib/security/captcha";

function solve(challenge: string, bits: number): string {
  for (let n = 0; ; n++) {
    const hash = createHash("sha256").update(`${challenge}.${n}`).digest("hex");
    let zeros = 0;
    for (const ch of hash) {
      const v = parseInt(ch, 16);
      if (v === 0) {
        zeros += 4;
        continue;
      }
      zeros += Math.clz32(v) - 28;
      break;
    }
    if (zeros >= bits) return `${challenge}#${n}`;
  }
}

afterEach(() => {
  (env as { CAPTCHA_PROVIDER?: string }).CAPTCHA_PROVIDER = undefined;
});

describe("proof-of-work captcha", () => {
  it("accepts a correct solution and rejects a wrong/absent one", () => {
    const { challenge, bits } = issuePowChallenge();
    const token = solve(challenge, bits);
    expect(verifyPow(token)).toBe(true);
    expect(verifyPow(`${challenge}#0`)).toBe(false); // nonce 0 won't meet the target
    expect(verifyPow(undefined)).toBe(false);
    expect(verifyPow("forged.challenge.sig#123")).toBe(false);
  });

  it("rejects a tampered challenge (bad HMAC)", () => {
    const { challenge, bits } = issuePowChallenge();
    const tampered = challenge.replace(/\.\w+$/, ".deadbeefdeadbeef");
    const token = solve(tampered, bits);
    expect(verifyPow(token)).toBe(false);
  });
});

describe("verifyCaptcha", () => {
  it("passes through (true) when captcha is disabled", async () => {
    expect(await verifyCaptcha(undefined)).toBe(true);
  });

  it("enforces PoW when the provider is pow", async () => {
    (env as { CAPTCHA_PROVIDER?: string }).CAPTCHA_PROVIDER = "pow";
    expect(await verifyCaptcha(undefined)).toBe(false);
    const { challenge, bits } = issuePowChallenge();
    expect(await verifyCaptcha(solve(challenge, bits))).toBe(true);
  });
});
