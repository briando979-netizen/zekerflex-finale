import { afterEach, describe, expect, it, vi } from "vitest";

const requirePrincipal = vi.fn();
const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requirePrincipal: (...a: unknown[]) => requirePrincipal(...a),
  requireRole: (...a: unknown[]) => requireRole(...a),
}));

vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

const unsubscribeByEmail = vi.fn();
vi.mock("@/lib/newsletter/store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/newsletter/store")>("@/lib/newsletter/store");
  return { ...actual, unsubscribeByEmail: (...a: unknown[]) => unsubscribeByEmail(...a) };
});

import { POST } from "@/app/api/admin/nieuwsbrief/unsubscribe/route";

const PRINCIPAL = { userId: "admin1", email: "admin@zekerflex.com" };

function req(body: unknown) {
  return new Request("http://localhost/api/admin/nieuwsbrief/unsubscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.clearAllMocks());

describe("POST /api/admin/nieuwsbrief/unsubscribe", () => {
  it("unsubscribes an existing subscriber by email", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    unsubscribeByEmail.mockResolvedValue({ email: "jan@example.nl", status: "unsubscribed" });

    const res = await POST(req({ email: "jan@example.nl" }), { params: Promise.resolve({}) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.subscriber.status).toBe("unsubscribed");
    expect(unsubscribeByEmail).toHaveBeenCalledWith("jan@example.nl");
  });

  it("404s when the address isn't a known subscriber", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);
    unsubscribeByEmail.mockResolvedValue(null);

    const res = await POST(req({ email: "nope@example.nl" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(404);
  });

  it("rejects an invalid email", async () => {
    requirePrincipal.mockResolvedValue(PRINCIPAL);
    requireRole.mockImplementation(() => undefined);

    const res = await POST(req({ email: "not-an-email" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(422);
    expect(unsubscribeByEmail).not.toHaveBeenCalled();
  });
});
