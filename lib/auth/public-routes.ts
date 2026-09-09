// ---------------------------------------------------------------------------
// The explicit allowlist of API routes that may be called without a session.
// Everything else under /api/* is protected by default at the middleware
// layer (see middleware.ts) — a route can still be more restrictive on top
// (role/org/branch checks), but it can no longer be *less* protected than
// "must be logged in" just because it forgot to call requirePrincipal().
//
// Each entry here was individually verified to be either:
//   - genuinely public by design (marketing/public-facing forms, webhooks,
//     health checks, the public partner API), or
//   - authenticated by a DIFFERENT mechanism than the session cookie
//     (API keys for /api/public/v1/*, a shared secret for /api/internal/*).
// ---------------------------------------------------------------------------

const PUBLIC_PREFIXES = [
  "/api/auth", // NextAuth itself + check-email/check-password/generate-password (pre-signup helpers)
  "/api/register",
  "/api/webhooks", // signature-verified (Stripe, Didit)
  "/api/public", // partner API — its own API-key auth (verifyApiKey/requireApiKey)
  "/api/internal", // cron/scheduler — its own shared-secret auth (checkInternalToken)
  "/api/health",
  "/api/ready",
  "/api/status",
  "/api/graphql", // auth + role checks live per-resolver, plus its own rate limiting
  "/api/chat", // public marketing chat widget + its own IP rate limiting
  "/api/demo", // public "book a demo" form + its .ics link
  "/api/werken-bij", // public job application form
  "/api/kennis/whitepaper", // public whitepaper downloads
  "/api/mail/afmelden",
  "/api/mail/voorkeuren", // token-based, not session-based
  "/api/nieuwsbrief", // signup + its own /afmelden
  "/api/analytics/track", // anonymous visitor tracking, rate-limited by session id
  "/api/shop", // public storefront reads; writes are admin-gated inside the route
] as const;

const PUBLIC_EXACT = new Set<string>([
  "/api/company/search", // public KVK autocomplete — /api/company/lookup and /company/register require a session
]);

/** /api/orgs/<tenantId>/photo is public; /api/orgs and /api/orgs/photo are not. */
const ORG_PHOTO_PATTERN = /^\/api\/orgs\/[^/]+\/photo$/;

export function isPublicApiRoute(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (ORG_PHOTO_PATTERN.test(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
