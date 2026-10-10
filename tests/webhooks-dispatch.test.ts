import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptWebhookSecret } from "@/lib/webhooks/crypto";

// dispatchWebhook was fully implemented (HMAC signing, retries, delivery
// tracking) but had zero call sites anywhere in the app — a partner who
// registered a subscription would never receive an event. This tests the
// dispatcher itself; the call sites are covered by each flow's own tests.

const findMany = vi.fn();
const deliveryCreate = vi.fn();
const deliveryUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookSubscription: { findMany: (...a: unknown[]) => findMany(...a) },
    webhookDelivery: {
      create: (...a: unknown[]) => deliveryCreate(...a),
      update: (...a: unknown[]) => deliveryUpdate(...a),
    },
  },
}));

import { dispatchWebhook } from "@/lib/webhooks/dispatcher";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("dispatchWebhook", () => {
  it("only targets active subscriptions for the given tenant", async () => {
    findMany.mockResolvedValue([]);
    await dispatchWebhook("shift.matched", "tenant_1", { shiftId: "s1" });
    expect(findMany).toHaveBeenCalledWith({ where: { tenantId: "tenant_1", active: true } });
  });

  it("signs the payload with the subscription's own secret and marks it delivered", async () => {
    const secret = "whsec_test_123";
    findMany.mockResolvedValue([
      { id: "sub_1", url: "https://partner.example/hook", secretCiphertext: encryptWebhookSecret(secret) },
    ]);
    deliveryCreate.mockResolvedValue({ id: "del_1" });
    deliveryUpdate.mockResolvedValue({});

    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await dispatchWebhook("timesheet.approved", "tenant_1", { timesheetId: "t1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://partner.example/hook");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-zekerflex-event"]).toBe("timesheet.approved");

    const body = init.body as string;
    const timestamp = headers["x-zekerflex-timestamp"];
    const expectedSig = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    expect(headers["x-zekerflex-signature"]).toBe(`v1=${expectedSig}`);

    expect(JSON.parse(body)).toMatchObject({ type: "timesheet.approved", data: { timesheetId: "t1" } });

    expect(deliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "del_1" },
        data: expect.objectContaining({ attempts: 1, statusCode: 200, nextAttemptAt: null }),
      }),
    );
  });

  it("delivers independently to every active subscription on the tenant", async () => {
    findMany.mockResolvedValue([
      { id: "sub_1", url: "https://a.example/hook", secretCiphertext: encryptWebhookSecret("s1") },
      { id: "sub_2", url: "https://b.example/hook", secretCiphertext: encryptWebhookSecret("s2") },
    ]);
    deliveryCreate.mockResolvedValue({ id: "del" });
    deliveryUpdate.mockResolvedValue({});
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await dispatchWebhook("dispute.opened", "tenant_1", { timesheetId: "t1" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["https://a.example/hook", "https://b.example/hook"]);
  });
});
