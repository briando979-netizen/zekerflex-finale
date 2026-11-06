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
    // 'self' (not 'none'): same-origin framing is allowed for the ZekerFlex AI
    // studio's live preview, but every cross-origin framer is still blocked.
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("manifest-src 'self'");
  });

  it("allows the own site, Stripe's iframe and YouTube's privacy-mode player by default; blob:/https: only in the studio", () => {
    const frameSrc = csp.split("; ").find((d) => d.startsWith("frame-src"))!;
    // 'self' on every document: the CSP belongs to the first document, and whoever logs in on
    // /login and lands in /admin keeps it (6 Nov: the Site-ontwerper preview was blocked).
    expect(frameSrc).toBe("frame-src 'self' https://js.stripe.com https://www.youtube-nocookie.com");
    expect(frameSrc).not.toContain("blob:");
    expect(frameSrc).not.toContain("https://www.youtube.com"); // only the no-cookie host
  });

  it("still allows the Google Fonts stylesheet + inline style (documented trade-off)", () => {
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("fonts.googleapis.com"); // fonts are self-hosted (lib/fonts.ts)
    expect(csp).toContain("font-src 'self'");
  });
});

describe("buildContentSecurityPolicy — ZekerFlex AI studio (scoped relaxations)", () => {
  it("lets the studio frame same-origin, blob and external pages (live preview)", () => {
    const csp = buildContentSecurityPolicy({ dev: false, nonce: "N", pathname: "/admin/zekerflex-ai" });
    const frameSrc = csp.split("; ").find((d) => d.startsWith("frame-src"))!;
    expect(frameSrc).toContain("'self'");
    expect(frameSrc).toContain("blob:");
    expect(frameSrc).toContain("https:");
    // Its scripts stay strict — only the isolated sandbox sub-frame loosens that.
    expect(csp).toContain("script-src 'self' 'nonce-N' 'strict-dynamic'");
  });

  it("runs the sandbox sub-frame's own HTML/JS under a loose, isolated policy", () => {
    const csp = buildContentSecurityPolicy({
      dev: false,
      nonce: "N",
      pathname: "/admin/zekerflex-ai/sandbox-frame",
    });
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).toContain("img-src * data: blob:");
    // Still framable only by same-origin (the studio page).
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it("does not loosen scripts for any other admin route", () => {
    const csp = buildContentSecurityPolicy({ dev: false, nonce: "N", pathname: "/admin/cockpit" });
    expect(csp).toContain("script-src 'self' 'nonce-N' 'strict-dynamic'");
    expect(csp).toContain("https://js.stripe.com");
  });

  it("every document may frame same-origin pages: the Site-ontwerper preview is reached by client-side navigation (also from /login), and the CSP stays the one of the first document", () => {
    for (const pathname of ["/admin", "/admin/cockpit", "/admin/huisstijl", "/admin/ontwerper", "/login", "/administratie", "/"]) {
      const frameSrc = buildContentSecurityPolicy({ dev: false, nonce: "N", pathname }).split("; ").find((d) => d.startsWith("frame-src"))!;
      expect(frameSrc, pathname).toBe("frame-src 'self' https://js.stripe.com https://www.youtube-nocookie.com");
    }
    // the studio's wider policy (blob:, https:) stays scoped to the studio
    const pub = buildContentSecurityPolicy({ dev: false, nonce: "N", pathname: "/administratie" }).split("; ").find((d) => d.startsWith("frame-src"))!;
    expect(pub).not.toContain("blob:");
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
