import { afterEach, describe, expect, it, vi } from "vitest";

// Beveiligingsronde 12 nov 2026 (86), groep 2: de accountroutes van rijscholen lezen een begrensde body, met een ruime
// limiet per IP vóór het lezen (ook voor acties die er geen hadden). Het Schwarzwald-voorstel is op 22 nov weggehaald.

const h = vi.hoisted(() => ({ enforceRateLimit: vi.fn(async (..._a: unknown[]) => undefined), siteRijschool: vi.fn(async () => ({ id: "r1" })) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: h.enforceRateLimit, fixedWindow: vi.fn(async () => ({ ok: true })), privateRateLimitIdentifier: (s: string) => s }));
vi.mock("@/lib/http/request", () => ({ clientIp: () => "198.51.100.4" }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rijschool/accounts", () => ({ eisZelfdeHerkomst: () => undefined, inloggen: vi.fn(), uitloggen: vi.fn(), wachtwoordMetUitnodiging: vi.fn() }));
vi.mock("@/lib/rijschool/toegang", () => ({ siteRijschool: h.siteRijschool }));
vi.mock("@/lib/rijschool/store", () => ({ nodigUit: vi.fn() }));

import { POST as rijschoolAccount } from "@/app/api/rijschool/site/[slug]/account/route";

const groot = "x".repeat(40_000);
const post = (body: string) => new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body });

afterEach(() => vi.clearAllMocks());

describe("accountroutes", () => {
  it("rijschool: limiet per IP vóór elke actie (ook uitloggen) en een begrensde body", async () => {
    const res = await rijschoolAccount(post(JSON.stringify({ actie: "inloggen", email: groot })), { params: Promise.resolve({ slug: "rijschool-test" }) });
    expect(res.status).toBe(422);
    expect(h.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ name: "rijschool-account-ip", identifier: "198.51.100.4" }));
  });
});
