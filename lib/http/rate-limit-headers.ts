import type { RateResult } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Standard rate-limit response headers (the IETF "RateLimit header fields for
// HTTP" convention: RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset),
// so a calling agent can self-throttle instead of discovering the limit by
// getting a 429. Attach to every public API response, success or not.
// ---------------------------------------------------------------------------

export function rateLimitHeaders(rate: RateResult): Record<string, string> {
  return {
    "RateLimit-Limit": String(rate.limit),
    "RateLimit-Remaining": String(rate.remaining),
    "RateLimit-Reset": String(rate.resetSeconds),
  };
}
