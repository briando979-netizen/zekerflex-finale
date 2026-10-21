import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Android app (TWA) mode: launched at /start?utm_source=twa, after which the
// public marketing site redirects to /start; dashboards and legal pages stay.

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, decodeSession: vi.fn().mockResolvedValue(null) };
});

import { middleware } from "../middleware";

function req(path: string, app = false): NextRequest {
  const r = new NextRequest(new URL(`https://www.zekerflex.com${path}`));
  if (app) r.cookies.set("zf_app", "1");
  return r;
}

describe("middleware — app mode", () => {
  it("sets the app cookie on the TWA launch URL", async () => {
    const res = await middleware(req("/start?utm_source=twa"));
    expect(res.cookies.get("zf_app")?.value).toBe("1");
  });

  it("sends the homepage and marketing pages to /start inside the app", async () => {
    for (const p of ["/", "/voor-bedrijven", "/prijzen", "/klussen"]) {
      const res = await middleware(req(p, true));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/start");
    }
  });

  it("keeps login, legal pages and the shop reachable inside the app", async () => {
    for (const p of ["/login", "/privacy", "/account-verwijderen", "/gegevens-verwijderen", "/shop/item"]) {
      const res = await middleware(req(p, true));
      expect(res.status).not.toBe(307);
    }
  });

  it("blocks the bank pages inside the app (web-only financial features)", async () => {
    for (const p of ["/dashboard/bank", "/werkgever/bank", "/betaalverzoek/abc"]) {
      const res = await middleware(req(p, true));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/start");
    }
  });

  it("leaves the website alone in a normal browser", async () => {
    const res = await middleware(req("/"));
    expect(res.status).toBe(200);
  });

  it("?app=0 leaves app mode", async () => {
    const res = await middleware(req("/?app=0", true));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toMatch(/zf_app=;/);
  });
});
