import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Een klantdomein (Caddy zet x-zf-site-host): nooit de app zelf, ook /login en /api niet. Klantwebsites zijn weg
// (22 nov 2026, fase C), dus een domein zonder rijschool geeft een nette 404. Een oud ontwerpvoorstel op een subdomein
// (x-zf-voorstel) ook; alleen /sw.js geeft een service-worker die zichzelf uitschakelt.

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, decodeSession: vi.fn().mockResolvedValue(null) };
});

import { middleware } from "../middleware";

const onDomain = (path: string, host = "bakkerij-jansen.nl") => new NextRequest(new URL(`https://${host}${path}`), { headers: { "x-zf-site-host": host } });
const rewrite = (res: Response) => res.headers.get("x-middleware-rewrite") ?? "";

describe("middleware — een eigen domein zonder website", () => {
  it("geeft een 404, nooit een 500 en nooit de app", async () => {
    for (const pad of ["/", "/contact", "/login", "/api/admin/mail"]) {
      const res = await middleware(onDomain(pad));
      expect(res.status, pad).toBe(404);
      expect(rewrite(res), pad).toBe("");
      expect(res.headers.get("X-Robots-Tag"), pad).toContain("noindex");
    }
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

describe("middleware — een oud ontwerpvoorstel op een subdomein", () => {
  const opVoorstel = (path: string) => new NextRequest(new URL(`https://smileyapp.zekerflex.com${path}`), { headers: { "x-zf-voorstel": "smileyapp" } });

  it("geeft een 404 en niets van ZekerFlex", async () => {
    for (const pad of ["/", "/login", "/api/admin/mail", "/voorstel/smileyapp"]) {
      const res = await middleware(opVoorstel(pad));
      expect(res.status, pad).toBe(404);
      expect(res.headers.get("X-Robots-Tag"), pad).toContain("noindex");
    }
  });

  it("/sw.js schakelt een eerder geïnstalleerde app uit", async () => {
    const res = await middleware(opVoorstel("/sw.js"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("unregister");
  });
});
