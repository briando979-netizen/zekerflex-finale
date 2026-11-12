import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// De Stripe-webhook leest de body begrensd (2 MB): te groot = 422 vóór er iets gecontroleerd wordt, en de handtekening
// wordt op precies de ontvangen tekst gecontroleerd (ook bij chunked, zonder Content-Length).

const constructWebhookEvent = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({ constructWebhookEvent: (...a: unknown[]) => constructWebhookEvent(...a) }));
vi.mock("@/lib/redis", () => ({ claimIdempotency: vi.fn().mockResolvedValue(true), releaseIdempotency: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/claims/fulfillment", () => ({ fulfillPaidClaim: vi.fn() }));
vi.mock("@/lib/billing/api-subscription-sync", () => ({ activateApiSubscription: vi.fn(), syncApiSubscription: vi.fn() }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(), mailShell: (t: string, b: string) => `${t}${b}` }));
vi.mock("@/lib/billing/reminders", () => ({ recipientsFor: vi.fn() }));
vi.mock("@/lib/billing/clawback", () => ({ recordChargeRefund: vi.fn(), recordDisputeOpened: vi.fn(), recordDisputeClosed: vi.fn(), settleClawbacks: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { POST } from "@/app/api/webhooks/stripe/route";

const MB = 1024 * 1024;
const chunked = (bytes: number) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const stuk = new Uint8Array(64 * 1024).fill(97);
      for (let i = 0; i < bytes; i += stuk.length) c.enqueue(stuk);
      c.close();
    },
  });

beforeEach(() => constructWebhookEvent.mockReset());

describe("POST /api/webhooks/stripe: begrensde body", () => {
  it("een te grote Content-Length geeft 422 en de handtekening wordt niet eens gecontroleerd", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": "t=1,v1=x", "content-length": String(3 * MB) }, body: "{}" });
    const res = await POST(req);
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
    expect(constructWebhookEvent).not.toHaveBeenCalled();
  });

  it("ook zonder Content-Length (chunked) stopt het lezen bij de grens: 422", async () => {
    const req = new Request("http://localhost/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: chunked(3 * MB), duplex: "half" } as RequestInit);
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(422);
    expect(constructWebhookEvent).not.toHaveBeenCalled();
  });

  it("een gewone body gaat onveranderd (byte voor byte als tekst, ook met é en emoji) naar de handtekeningcontrole", async () => {
    const body = JSON.stringify({ id: "evt_1", type: "ping.test", data: { object: { naam: "Zoë 😀" } } });
    constructWebhookEvent.mockReturnValue({ id: "evt_1", type: "unknown.event", data: { object: {} } });
    const res = await POST(new NextRequest("http://localhost/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body }));
    expect(res.status).toBe(200);
    expect(constructWebhookEvent).toHaveBeenCalledTimes(1);
    expect(constructWebhookEvent.mock.calls[0]![0]).toBe(body);
    expect(constructWebhookEvent.mock.calls[0]![1]).toBe("t=1,v1=x");
  });

  it("een geldige, ondertekende gebeurtenis wordt nog steeds verwerkt (200)", async () => {
    constructWebhookEvent.mockReturnValue({ id: "evt_ok", type: "unknown.event", data: { object: {} } });
    const res = await POST(new NextRequest("http://localhost/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": "t=1,v1=ok" }, body: "{}" }));
    expect(res.status).toBe(200);
  });
});
