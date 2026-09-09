import { describe, expect, it } from "vitest";
import { isPublicApiRoute } from "@/lib/auth/public-routes";

// ---------------------------------------------------------------------------
// The allowlist middleware.ts uses to decide which /api/* routes may be
// called without a session. Getting an entry wrong in either direction is
// bad: too generous silently reopens exactly the class of bug this default-
// deny change exists to close; too strict breaks a real public flow (signup,
// webhooks, the partner API). These tests pin both directions down.
// ---------------------------------------------------------------------------

describe("isPublicApiRoute — allowed", () => {
  const cases = [
    "/api/auth/session",
    "/api/auth/check-email",
    "/api/register",
    "/api/webhooks/stripe",
    "/api/webhooks/didit",
    "/api/public/v1/shifts",
    "/api/internal/matching/tick",
    "/api/health",
    "/api/ready",
    "/api/status",
    "/api/graphql",
    "/api/chat",
    "/api/chat/rate",
    "/api/demo",
    "/api/demo/abc123/ics",
    "/api/werken-bij",
    "/api/kennis/whitepaper/omzetbelasting",
    "/api/mail/afmelden",
    "/api/mail/voorkeuren",
    "/api/nieuwsbrief",
    "/api/nieuwsbrief/afmelden",
    "/api/analytics/track",
    "/api/shop/products",
    "/api/shop/media/abc123",
    "/api/company/search",
    "/api/orgs/org_babycare/photo",
  ];
  it.each(cases)("%s is public", (path) => {
    expect(isPublicApiRoute(path)).toBe(true);
  });
});

describe("isPublicApiRoute — protected (must NOT be public)", () => {
  const cases = [
    "/api/company/lookup", // shares the /api/company prefix with the public search route
    "/api/company/register",
    "/api/orgs", // bare collection route
    "/api/orgs/photo", // the CALLER's own org photo — needs a session to know who's calling
    "/api/invoices/inv_1/checkout",
    "/api/me/documents/doc_1",
    "/api/me/certificates",
    "/api/uploads/upl_1",
    "/api/admin/mail",
    "/api/werkgever/claims/claim_1",
    "/api/timesheets/ts_1/submit",
    "/api/people/search",
    "/api/geo/search", // note: /api/geo/tile also requires a session; only geo isn't prefixed publicly here
    "/api/calls/incoming",
  ];
  it.each(cases)("%s is not public", (path) => {
    expect(isPublicApiRoute(path)).toBe(false);
  });
});
