import { createECDH, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { importJWK, jwtVerify } from "jose";
import { sendWebPush } from "@/lib/notifications/push/web-push";
import { decryptPayload } from "@/lib/notifications/push/encrypt";

afterEach(() => vi.unstubAllGlobals());

describe("sendWebPush", () => {
  it("posts an RFC 8291 body + VAPID header the push service can consume", async () => {
    const client = createECDH("prime256v1");
    client.generateKeys();
    const auth = randomBytes(16);
    const message = JSON.stringify({ title: "Nieuwe shift", body: "AH Amsterdam" });

    let captured: { url: string; init: RequestInit } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        captured = { url, init };
        return new Response(null, { status: 201 });
      }) as never,
    );

    const res = await sendWebPush(
      {
        endpoint: "https://push.example.org/sub/abc",
        p256dh: client.getPublicKey().toString("base64url"),
        auth: auth.toString("base64url"),
      },
      message,
      { ttlSeconds: 900 },
    );

    expect(res).toEqual({ ok: true, statusCode: 201, gone: false });
    expect(captured!.url).toBe("https://push.example.org/sub/abc");

    const headers = captured!.init.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers["TTL"]).toBe("900");

    // VAPID: audience is the endpoint origin, JWT verifies against k=.
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(headers["Authorization"]!);
    expect(m).not.toBeNull();
    const pub = Buffer.from(m![2]!, "base64url");
    const vapidKey = await importJWK(
      {
        kty: "EC",
        crv: "P-256",
        x: pub.subarray(1, 33).toString("base64url"),
        y: pub.subarray(33, 65).toString("base64url"),
      },
      "ES256",
    );
    const { payload } = await jwtVerify(m![1]!, vapidKey, {
      audience: "https://push.example.org",
    });
    expect(payload.sub).toBe("mailto:bounced@zekerflex.com");

    // Body decrypts back to the original message with the subscription key.
    const body = Buffer.from(await (captured!.init.body as Blob).arrayBuffer());
    const clear = decryptPayload(
      body,
      { publicKey: client.getPublicKey(), privateKey: client.getPrivateKey() },
      auth,
    );
    expect(clear.toString("utf8")).toBe(message);
  });

  it("flags a 410 Gone subscription for cleanup", async () => {
    const client = createECDH("prime256v1");
    client.generateKeys();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 410 })) as never,
    );

    const res = await sendWebPush(
      {
        endpoint: "https://push.example.org/sub/dead",
        p256dh: client.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
      "{}",
      { ttlSeconds: 60 },
    );
    expect(res).toEqual({ ok: false, statusCode: 410, gone: true });
  });
});
