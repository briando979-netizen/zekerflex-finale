import { describe, expect, it } from "vitest";
import { isPublicApiRoute, matchRouteRule } from "@/lib/auth/rbac";

describe("API secure-by-default policy", () => {
  it.each(["/api/auth/session", "/api/public/v1/shifts", "/api/health", "/api/webhooks/didit"])(
    "documents %s as a public transport route",
    (path) => expect(isPublicApiRoute(path)).toBe(true),
  );

  it.each(["/api/uploads", "/api/invoices/other-tenant/pdf", "/api/me", "/api/new-feature"])(
    "requires authentication for %s",
    (path) => {
      expect(isPublicApiRoute(path)).toBe(false);
      expect(matchRouteRule(path)?.roles.length).toBeGreaterThan(0);
      expect(matchRouteRule(path)?.redirectOnDeny).toBe(false);
    },
  );

  it("keeps platform administration restricted", () => {
    expect(matchRouteRule("/api/admin/audit")?.roles).toEqual(["PLATFORM_ADMIN"]);
  });
});
