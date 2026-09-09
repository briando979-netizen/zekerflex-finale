import { test, expect } from "@playwright/test";

// The check-email endpoint is limited to 20 requests / 60s per IP. After that it
// must return 429 with a Retry-After header (regression for the rate-limit
// consolidation — it used to answer 422).
test("check-email rate-limits with 429 + Retry-After", async ({ request }) => {
  let limited: { status: number; retryAfter: string | null } | null = null;

  for (let i = 0; i < 30; i += 1) {
    const res = await request.post("/api/auth/check-email", {
      data: { email: `probe${i}@example.com` },
    });
    if (res.status() === 429) {
      limited = { status: 429, retryAfter: res.headers()["retry-after"] ?? null };
      break;
    }
  }

  expect(limited, "expected a 429 within 30 requests").not.toBeNull();
  expect(Number(limited!.retryAfter)).toBeGreaterThan(0);
});
