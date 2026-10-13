import { describe, expect, it } from "vitest";
import { rateLimitHeaders } from "@/lib/http/rate-limit-headers";
import type { RateResult } from "@/lib/rate-limit";

describe("rateLimitHeaders", () => {
  it("maps a RateResult to the standard RateLimit-* header names", () => {
    const rate: RateResult = { ok: true, count: 5, limit: 120, remaining: 115, retryAfterSeconds: 0, resetSeconds: 42 };
    expect(rateLimitHeaders(rate)).toEqual({
      "RateLimit-Limit": "120",
      "RateLimit-Remaining": "115",
      "RateLimit-Reset": "42",
    });
  });

  it("still reports a sensible reset when the window is exhausted", () => {
    const rate: RateResult = { ok: false, count: 121, limit: 120, remaining: 0, retryAfterSeconds: 30, resetSeconds: 30 };
    const headers = rateLimitHeaders(rate);
    expect(headers["RateLimit-Remaining"]).toBe("0");
    expect(headers["RateLimit-Reset"]).toBe("30");
  });
});
