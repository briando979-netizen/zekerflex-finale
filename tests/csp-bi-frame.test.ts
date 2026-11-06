import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// De CSP leest METABASE_PUBLIC_URL bij het laden van de module (de middleware
// draait op de edge), dus elke test laadt hem opnieuw met een eigen waarde.
const laad = async () => {
  vi.resetModules();
  return import("@/lib/security/csp");
};
const frameSrc = (csp: string) => /frame-src[^;]*/.exec(csp)?.[0] ?? "";

const oud = process.env.METABASE_PUBLIC_URL;
beforeEach(() => delete process.env.METABASE_PUBLIC_URL);
afterEach(() => {
  if (oud === undefined) delete process.env.METABASE_PUBLIC_URL;
  else process.env.METABASE_PUBLIC_URL = oud;
});

describe("CSP: het ingebedde BI-dashboard (Rapportages)", () => {
  it("zonder BI verandert er niets", async () => {
    const { buildContentSecurityPolicy } = await laad();
    const f = frameSrc(buildContentSecurityPolicy({ dev: false, nonce: "n", pathname: "/werkgever/rapportages" }));
    expect(f).toBe("frame-src https://js.stripe.com https://www.youtube-nocookie.com");
  });

  it("met BI mag die host in een frame, op het portaal, in beheer en in het OS", async () => {
    process.env.METABASE_PUBLIC_URL = "https://bi.voorbeeld.test/";
    const { buildContentSecurityPolicy } = await laad();
    for (const pathname of ["/werkgever/rapportages", "/admin/rapportages", "/os"]) {
      expect(frameSrc(buildContentSecurityPolicy({ dev: false, nonce: "n", pathname })), pathname).toContain("https://bi.voorbeeld.test");
    }
    // 'self' blijft alleen waar het hoorde
    expect(frameSrc(buildContentSecurityPolicy({ dev: false, nonce: "n", pathname: "/werkgever/rapportages" }))).not.toContain("'self'");
    expect(frameSrc(buildContentSecurityPolicy({ dev: false, nonce: "n", pathname: "/os" }))).toContain("'self'");
  });

  it("alleen https; een onveilige of kapotte waarde komt er niet in", async () => {
    for (const waarde of ["http://bi.voorbeeld.test", "geen-url", " "]) {
      process.env.METABASE_PUBLIC_URL = waarde;
      const { buildContentSecurityPolicy } = await laad();
      expect(frameSrc(buildContentSecurityPolicy({ dev: false, nonce: "n", pathname: "/os" })), waarde).toBe("frame-src 'self' https://js.stripe.com https://www.youtube-nocookie.com");
    }
  });
});
