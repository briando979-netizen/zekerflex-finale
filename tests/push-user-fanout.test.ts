import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const updateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    webPushSubscription: {
      findMany: (...a: unknown[]) => findMany(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
    },
  },
}));
vi.mock("@/lib/metrics", () => ({ recordShiftOffer: () => undefined }));

let enabled = true;
const sendWebPush = vi.fn();
vi.mock("@/lib/notifications/push/web-push", () => ({
  isWebPushEnabled: () => enabled,
  sendWebPush: (...a: unknown[]) => sendWebPush(...a),
}));

import { sendUserPush } from "@/lib/notifications/push";

const PUSH = {
  title: "📞 Jan belt je",
  body: "Tik om op te nemen in ZekerFlex.",
  data: { type: "CALL", url: "/berichten?thread=t1", tag: "call-1" },
  ttlSeconds: 45,
};

beforeEach(() => {
  enabled = true;
  findMany.mockResolvedValue([
    { endpoint: "https://push.example/phone", p256dh: "k1", authKey: "a1" },
    { endpoint: "https://push.example/laptop", p256dh: "k2", authKey: "a2" },
  ]);
  updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.clearAllMocks());

describe("sendUserPush", () => {
  it("sends to every live device of the (deduplicated) accounts", async () => {
    sendWebPush.mockResolvedValue({ ok: true, statusCode: 201, gone: false });
    const delivered = await sendUserPush(["u1", "u1", "u2", ""], PUSH);
    expect(delivered).toBe(2);
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: { in: ["u1", "u2"] }, disabledAt: null },
      select: { endpoint: true, p256dh: true, authKey: true },
    });
    const [target, payload, opts] = sendWebPush.mock.calls[0]!;
    expect(target).toEqual({ endpoint: "https://push.example/phone", p256dh: "k1", auth: "a1" });
    expect(JSON.parse(payload as string)).toEqual({ title: PUSH.title, body: PUSH.body, data: PUSH.data });
    expect(opts).toEqual({ ttlSeconds: 45 });
  });

  it("disables a subscription the push service reports gone", async () => {
    sendWebPush
      .mockResolvedValueOnce({ ok: true, statusCode: 201, gone: false })
      .mockResolvedValueOnce({ ok: false, statusCode: 410, gone: true });
    const delivered = await sendUserPush(["u1"], PUSH);
    expect(delivered).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { endpoint: { in: ["https://push.example/laptop"] } },
      data: { disabledAt: expect.any(Date) },
    });
  });

  it("does nothing when Web Push isn't configured", async () => {
    enabled = false;
    expect(await sendUserPush(["u1"], PUSH)).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
