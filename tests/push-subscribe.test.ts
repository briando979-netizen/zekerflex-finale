import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requirePrincipal = vi.fn();
vi.mock("@/lib/auth", () => ({ requirePrincipal: () => requirePrincipal() }));

const fpFindUnique = vi.fn();
const subCount = vi.fn();
const subUpsert = vi.fn();
const subDeleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: (...a: unknown[]) => fpFindUnique(...a) },
    webPushSubscription: {
      count: (...a: unknown[]) => subCount(...a),
      upsert: (...a: unknown[]) => subUpsert(...a),
      deleteMany: (...a: unknown[]) => subDeleteMany(...a),
    },
  },
}));

vi.mock("@/lib/notifications/push/web-push", () => ({ isWebPushEnabled: () => true }));

import { GET, POST, DELETE } from "@/app/api/me/push/route";

const req = (body?: unknown) =>
  new Request("http://localhost/api/me/push", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "vitest" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BPk...clientkey", auth: "c2VjcmV0" },
};

beforeEach(() => {
  requirePrincipal.mockResolvedValue({ userId: "usr_1" });
  fpFindUnique.mockResolvedValue({ id: "fp_1" });
  subCount.mockResolvedValue(0);
  subUpsert.mockResolvedValue({});
  subDeleteMany.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/me/push", () => {
  it("exposes the VAPID public key + subscription status for a freelancer", async () => {
    subCount.mockResolvedValue(1);
    const res = await GET();
    const body = await res.json();
    expect(body).toMatchObject({ configured: true, supported: true, subscribed: true });
    expect(typeof body.vapidPublicKey === "string" || body.vapidPublicKey === null).toBe(true);
  });

  it("reports unsupported for a non-freelancer", async () => {
    fpFindUnique.mockResolvedValue(null);
    const body = await (await GET()).json();
    expect(body.supported).toBe(false);
    expect(body.subscribed).toBe(false);
  });
});

describe("POST /api/me/push", () => {
  it("upserts the subscription keyed by endpoint, bound to the freelancer", async () => {
    const res = await POST(req(SUB));
    expect(res.status).toBe(200);
    expect(subUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: SUB.endpoint },
        create: expect.objectContaining({ freelancerId: "fp_1", p256dh: SUB.keys.p256dh, authKey: SUB.keys.auth }),
        update: expect.objectContaining({ disabledAt: null }),
      }),
    );
  });

  it("rejects a malformed body", async () => {
    const res = await POST(req({ endpoint: "not-a-url" }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(subUpsert).not.toHaveBeenCalled();
  });

  it("refuses when the caller has no freelancer profile", async () => {
    fpFindUnique.mockResolvedValue(null);
    const res = await POST(req(SUB));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("DELETE /api/me/push", () => {
  it("removes only this freelancer's row for the endpoint", async () => {
    const res = await DELETE(req({ endpoint: SUB.endpoint }));
    expect(res.status).toBe(200);
    expect(subDeleteMany).toHaveBeenCalledWith({
      where: { endpoint: SUB.endpoint, freelancerId: "fp_1" },
    });
  });
});
