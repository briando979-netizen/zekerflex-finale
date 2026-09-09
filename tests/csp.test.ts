import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/security/csp";

describe("generateNonce", () => {
  it("is base64 and unpredictable", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(a).not.toBe(b);
    // 16 bytes -> 24 base64 chars
    expect(a.length).toBe(24);
  });
});

describe("buildContentSecurityPolicy — production", () => {
  const csp = buildContentSecurityPolicy({ dev: false, nonce: "TESTNONCE" });

  it("uses a nonce + strict-dynamic for scripts, never 'unsafe-inline' / 'unsafe-eval'", () => {
    expect(csp).toContain("script-src 'self' 'nonce-TESTNONCE' 'strict-dynamic'");
    const scriptDirective = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scriptDirective).not.toContain("unsafe-inline");
    expect(scriptDirective).not.toContain("unsafe-eval");
  });

  it("locks down the usual suspects", () => {
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("connect-src 'self'");
  });

  it("still allows the Google Fonts stylesheet + inline style (documented trade-off)", () => {
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
  });
});

describe("buildContentSecurityPolicy — dev", () => {
  const csp = buildContentSecurityPolicy({ dev: true, nonce: "x" });

  it("relaxes script-src + connect-src for React Refresh / HMR only", () => {
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: http: https:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
