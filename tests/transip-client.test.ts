import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

// De TransIP-koppeling: elk tokenverzoek moet met de privésleutel ondertekend
// zijn (RSA-SHA512, base64 in de kop "Signature") en alleen vanaf het IP van de
// server werken. Hier met een echt sleutelpaar nagerekend, zoals TransIP doet.

const fakeEnv = vi.hoisted(() => ({ TRANSIP_LOGIN: "zekerflex", TRANSIP_PRIVATE_KEY: "" }));
vi.mock("@/lib/env", () => ({ env: fakeEnv }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { createMailbox, domainAvailability, listMailboxes } from "@/lib/mail/hosting/transip";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
// zoals in .env.production: de PEM op één regel met letterlijke \n
fakeEnv.TRANSIP_PRIVATE_KEY = privateKey.replace(/\n/g, "\\n");

const json = (status: number, body?: unknown) => new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("TransIP-koppeling", () => {
  it("ondertekent het tokenverzoek goed, alleen voor het eigen IP, en hergebruikt het token", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        if (url.endsWith("/v6/auth")) return json(201, { token: "tok-1" });
        if (url.endsWith("/v6/email/zekerflex.com/mailboxes") && init.method === "GET") return json(200, { mailboxes: [{ localPart: "info", domain: "zekerflex.com" }] });
        return json(201);
      }),
    );

    expect((await listMailboxes("zekerflex.com")).map((m) => m.localPart)).toEqual(["info"]);
    await createMailbox("zekerflex.com", { localPart: "jan", password: "paars-Fiets-73-boom", maxDiskUsage: 2048 });

    const auth = calls[0]!;
    expect(auth.url).toBe("https://api.transip.nl/v6/auth");
    const body = String(auth.init.body);
    const signature = (auth.init.headers as Record<string, string>).Signature!;
    expect(verify("sha512", Buffer.from(body), publicKey, Buffer.from(signature, "base64"))).toBe(true);
    const sent = JSON.parse(body);
    expect(sent).toMatchObject({ login: "zekerflex", read_only: false, expiration_time: "30 minutes", global_key: false });
    expect(sent.nonce.length).toBeGreaterThanOrEqual(6);
    expect(sent.nonce.length).toBeLessThanOrEqual(32);

    // daarna alleen nog met het token, één keer ingelogd
    expect(calls.filter((c) => c.url.endsWith("/auth"))).toHaveLength(1);
    const create = calls[2]!;
    expect(create.url).toBe("https://api.transip.nl/v6/email/zekerflex.com/mailboxes");
    expect((create.init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    expect(JSON.parse(String(create.init.body))).toEqual({ localPart: "jan", password: "paars-Fiets-73-boom", maxDiskUsage: 2048 });
  });

  it("vertaalt een weigering van TransIP naar een duidelijke fout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.endsWith("/v6/auth") ? json(201, { token: "tok-2" }) : json(409, { error: "Mailbox already exists" }))),
    );
    await expect(createMailbox("zekerflex.com", { localPart: "jan", password: "x", maxDiskUsage: 2048 })).rejects.toMatchObject({
      status: 409,
      message: "TransIP: Mailbox already exists",
    });
  });

  it("zoekt op of een domeinnaam vrij is", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/v6/auth")
          ? json(201, { token: "tok-3" })
          : json(200, { availability: { domainName: "bakkerij-jan.nl", status: "free", actions: ["register"] } }),
      ),
    );
    expect(await domainAvailability("bakkerij-jan.nl")).toEqual({ domainName: "bakkerij-jan.nl", status: "free", actions: ["register"] });
  });
});
