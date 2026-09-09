import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// middleware.ts's default-deny branch: an /api/* route with no ROUTE_RULES
// entry and no public-routes.ts entry must require a valid session. These
// tests exercise that branch directly (decodeSession mocked) since it's the
// mechanism the whole review item ("autorisatie standaard dichtzetten")
// depends on — a regression here silently reopens every route that relies on
// this safety net instead of its own requirePrincipal() call.
// ---------------------------------------------------------------------------

const decodeSessionMock = vi.fn();
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, decodeSession: (...a: unknown[]) => decodeSessionMock(...a) };
});

import { middleware } from "../middleware";

beforeEach(() => {
  decodeSessionMock.mockReset();
});

function reqFor(path: string): NextRequest {
  return new NextRequest(new URL(`https://zekerflex.com${path}`));
}

describe("middleware — default-deny for unmatched /api/* routes", () => {
  it("blocks an unrecognized protected-looking API route with no session (401, not a redirect)", async () => {
    decodeSessionMock.mockResolvedValue(null);
    const res = await middleware(reqFor("/api/invoices/inv_1/checkout"));
    expect(res.status).toBe(401);
  });

  it("lets a valid session through to an unmatched protected route (route does its own role check)", async () => {
    decodeSessionMock.mockResolvedValue({ sub: "usr_1", email: "u@x.nl", name: "U", roles: [] });
    const res = await middleware(reqFor("/api/invoices/inv_1/checkout"));
    // NextResponse.next() carries no status of its own — absence of a 401/redirect is the assertion.
    expect(res.status).toBe(200);
  });

  it("never calls decodeSession for an explicitly public route", async () => {
    const res = await middleware(reqFor("/api/register"));
    expect(decodeSessionMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("never calls decodeSession for a webhook", async () => {
    await middleware(reqFor("/api/webhooks/stripe"));
    expect(decodeSessionMock).not.toHaveBeenCalled();
  });

  it("still applies the existing role rule (not the default-deny branch) for /api/admin/*", async () => {
    decodeSessionMock.mockResolvedValue({
      sub: "usr_1",
      email: "u@x.nl",
      name: "U",
      roles: [{ role: "FREELANCER", organizationId: "org_platform", locationIds: [] }],
    });
    const res = await middleware(reqFor("/api/admin/mail"));
    // Authenticated but wrong role for the ROUTE_RULES-gated /api/admin/* -> 403, not 401.
    expect(res.status).toBe(403);
  });
});
