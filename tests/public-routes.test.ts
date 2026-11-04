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
    "/api/afspraak",
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
    "/api/sites/domein-check", // Caddy's on-demand TLS ask
    "/api/media/youtube/dQw4w9WgXcQ", // our copy of a YouTube thumbnail
    "/api/indexnow-key", // IndexNow verifies site ownership without a session
    "/api/rekentools/uitkomst", // "stuur mij de uitkomst" on the public rekentools
    "/api/auth/werkgever", // /klus-plaatsen: is the caller's own session a werkgever? (yes/no only)
    "/api/review-scan", // free public review-scan
    "/api/review-scan/lead", // its contact form
    "/api/klus-plaatsen/website", // /klus-plaatsen reads a company's public front page
    "/api/review-scan", // free public review-scan
    "/api/review-scan/lead", // its contact form
    "/api/domeinen/zoek", // is a domain name still free (public RDAP)
    "/api/domeinen/aanvraag", // request a domain / transfer
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
    "/api/sites/domein-check/extra", // exact match only
    "/api/werkgever/sites/domain",
    "/api/indexnow-key/extra", // exact match only
  ];
  it.each(cases)("%s is not public", (path) => {
    expect(isPublicApiRoute(path)).toBe(false);
  });
});
