import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Een klantdomein (Caddy zet x-zf-site-host): alles gaat naar die website,
// ook /login en /api — nooit naar de app zelf — met de sandbox-CSP van dat domein.

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, decodeSession: vi.fn().mockResolvedValue(null) };
});

import { middleware } from "../middleware";

const onDomain = (path: string, host = "bakkerij-jansen.nl") => new NextRequest(new URL(`https://${host}${path}`), { headers: { "x-zf-site-host": host } });
const rewrite = (res: Response) => res.headers.get("x-middleware-rewrite") ?? "";

describe("middleware — website op een eigen domein", () => {
  it("stuurt een pagina naar /site-domein/<domein>/… met de CSP van dat domein", async () => {
    const res = await middleware(onDomain("/contact"));
    expect(rewrite(res)).toContain("/site-domein/bakkerij-jansen.nl/contact");
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(res.headers.get("Content-Security-Policy")).toContain("https://bakkerij-jansen.nl");
  });

  it("de homepage wordt /site-domein/<domein> zonder schuine streep erachter", async () => {
    expect(rewrite(await middleware(onDomain("/")))).toMatch(/\/site-domein\/bakkerij-jansen\.nl$/);
  });

  it("ook /login en /api gaan naar de website, nooit naar de app", async () => {
    expect(rewrite(await middleware(onDomain("/login")))).toContain("/site-domein/bakkerij-jansen.nl/login");
    const api = await middleware(onDomain("/api/admin/mail"));
    expect(api.status).not.toBe(401);
    expect(rewrite(api)).toContain("/site-domein/bakkerij-jansen.nl/api/admin/mail");
  });

  it("een rare kop wordt geweigerd", async () => {
    const res = await middleware(new NextRequest(new URL("https://x.nl/"), { headers: { "x-zf-site-host": "bad host;script-src *" } }));
    expect(res.status).toBe(400);
  });

  it("zonder kop blijft zekerflex.com zichzelf", async () => {
    const res = await middleware(new NextRequest(new URL("https://zekerflex.com/login")));
    expect(rewrite(res)).toBe("");
    expect(res.headers.get("Content-Security-Policy")).toContain("script-src");
  });
});
