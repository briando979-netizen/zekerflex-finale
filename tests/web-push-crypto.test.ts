import { createECDH, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { importJWK, jwtVerify } from "jose";
import {
  decryptPayload,
  encryptPayload,
  generateServerKeys,
} from "@/lib/notifications/push/encrypt";
import {
  generateVapidKeys,
  tot32Bytes,
  vapidAuthorization,
} from "@/lib/notifications/push/vapid";

function clientKeypair() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: ecdh.getPublicKey(), privateKey: ecdh.getPrivateKey() };
}

describe("Web Push payload encryption (RFC 8291)", () => {
  it("round-trips a payload through encrypt -> decrypt", () => {
    const client = clientKeypair();
    const authSecret = randomBytes(16);
    const message = JSON.stringify({ title: "Nieuwe shift", body: "Albert Heijn" });

    const body = encryptPayload({
      payload: Buffer.from(message, "utf8"),
      clientPublicKey: client.publicKey,
      authSecret,
    });

    const recovered = decryptPayload(body, client, authSecret);
    expect(recovered.toString("utf8")).toBe(message);
  });

  it("emits a well-formed RFC 8188 header", () => {
    const client = clientKeypair();
    const salt = randomBytes(16);
    const serverKeys = generateServerKeys();

    const body = encryptPayload({
      payload: Buffer.from("x"),
      clientPublicKey: client.publicKey,
      authSecret: randomBytes(16),
      salt,
      serverKeys,
    });

    expect(body.subarray(0, 16).equals(salt)).toBe(true);
    expect(body.readUInt32BE(16)).toBe(4096); // record size
    expect(body.readUInt8(20)).toBe(65); // keyid length
    expect(body.subarray(21, 86).equals(serverKeys.publicKey)).toBe(true);
  });

  it("rejects a malformed subscription key", () => {
    expect(() =>
      encryptPayload({
        payload: Buffer.from("x"),
        clientPublicKey: Buffer.alloc(10),
        authSecret: randomBytes(16),
      }),
    ).toThrow(/65-byte/);
  });

  it("fails to decrypt with the wrong auth secret", () => {
    const client = clientKeypair();
    const body = encryptPayload({
      payload: Buffer.from("secret"),
      clientPublicKey: client.publicKey,
      authSecret: randomBytes(16),
    });
    expect(() => decryptPayload(body, client, randomBytes(16))).toThrow();
  });
});

describe("VAPID authorization header", () => {
  it("produces a verifiable ES256 JWT bound to the audience", async () => {
    const keys = generateVapidKeys();
    const header = await vapidAuthorization({
      audience: "https://push.example.org",
      subject: "mailto:ops@zekerflex.nl",
      keys,
    });

    const match = header.match(/^vapid t=([^,]+), k=(.+)$/);
    expect(match).not.toBeNull();
    const [, jwt, k] = match!;
    expect(k).toBe(keys.publicKey);

    const pub = Buffer.from(keys.publicKey, "base64url");
    const publicKey = await importJWK(
      {
        kty: "EC",
        crv: "P-256",
        x: pub.subarray(1, 33).toString("base64url"),
        y: pub.subarray(33, 65).toString("base64url"),
      },
      "ES256",
    );
    const { payload } = await jwtVerify(jwt!, publicKey, {
      audience: "https://push.example.org",
    });
    expect(payload.sub).toBe("mailto:ops@zekerflex.nl");
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  // getPrivateKey() laat voorloopnullen weg: ±1 op 256 sleutels was 31 bytes en werd geweigerd (15 nov, willekeurig
  // rood in de controle). Nu altijd 32 bytes, en een korte sleutel uit de omgeving werkt ook.
  it("een geheime sleutel die met een nul-byte begint, werkt (ook als hij 31 bytes is opgeslagen)", async () => {
    const d = Buffer.concat([Buffer.from([0]), randomBytes(31)]);
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(d);
    const keys = { publicKey: ecdh.getPublicKey().toString("base64url"), privateKey: d.subarray(1).toString("base64url") };
    const header = await vapidAuthorization({ audience: "https://push.example.org", subject: "mailto:ops@zekerflex.nl", keys });
    const jwt = header.match(/^vapid t=([^,]+), k=/)?.[1] ?? "";
    const pub = Buffer.from(keys.publicKey, "base64url");
    const publicKey = await importJWK({ kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33, 65).toString("base64url") }, "ES256");
    await expect(jwtVerify(jwt, publicKey, { audience: "https://push.example.org" })).resolves.toBeTruthy();
  });

  it("nieuwe sleutels zijn altijd 32 bytes", () => {
    expect(tot32Bytes(Buffer.from([1, 2]))).toEqual(Buffer.concat([Buffer.alloc(30), Buffer.from([1, 2])]));
    for (let i = 0; i < 1000; i++) expect(Buffer.from(generateVapidKeys().privateKey, "base64url").length).toBe(32);
  });
});
