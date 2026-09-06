import { describe, expect, it } from "vitest";
import { isPublicApiRoute, matchRouteRule } from "@/lib/auth/rbac";

describe("API secure-by-default policy", () => {
  it.each([["/api/auth/session", "GET"], ["/api/public/v1/shifts", "GET"], ["/api/health", "GET"], ["/api/webhooks/didit", "POST"], ["/api/chat/rate", "POST"], ["/api/orgs/acme/photo", "GET"]])(
    "documents %s %s as a public transport route",
    (path, method) => expect(isPublicApiRoute(path, method)).toBe(true),
  );

  it("does not expose new descendants or unsupported methods", () => {
    expect(isPublicApiRoute("/api/company/export", "GET")).toBe(false);
    expect(isPublicApiRoute("/api/register", "GET")).toBe(false);
    expect(isPublicApiRoute("/api/webhooks/new-provider", "POST")).toBe(false);
    expect(isPublicApiRoute("/api/internal/new-job", "POST")).toBe(false);
    expect(isPublicApiRoute("/api/calls/incoming", "GET")).toBe(false);
  });

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
