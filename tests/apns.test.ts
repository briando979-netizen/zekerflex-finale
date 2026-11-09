import { EventEmitter } from "node:events";
import { generateKeyPairSync, verify } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Pushmeldingen naar de iPhone-app (lib/notifications/push/apns.ts): het token
// voor Apple, de inhoud, de apparaatcodes per account en het verzenden (met een
// nagebootste HTTP/2-verbinding: geen verkeer naar Apple in een test).
// ---------------------------------------------------------------------------

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvListEntries: async (p: string) => [...kv.entries()].filter(([k]) => k.startsWith(p)).map(([key, value]) => ({ key, value: structuredClone(value) })),
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => undefined } }));

// Apple naspelen: per apparaatcode een status (200, 410 …) en het verzoek bewaren
const antwoordVoor = new Map<string, { status: number; reden?: string }>();
const verzoeken: { headers: Record<string, string>; body: string }[] = [];
let verbindingen = 0;
vi.mock("node:http2", async (origineel) => {
  const echt = await origineel<typeof import("node:http2")>();
  return {
    ...echt,
    connect: () => {
      verbindingen++;
      return {
        on: () => undefined,
        close: () => undefined,
        request: (headers: Record<string, string>) => {
          const stroom = new EventEmitter() as EventEmitter & Record<string, unknown>;
          stroom.setEncoding = () => undefined;
          stroom.setTimeout = () => undefined;
          stroom.close = () => undefined;
          stroom.end = (body: string) => {
            verzoeken.push({ headers, body });
            const token = String(headers[":path"]).replace("/3/device/", "");
            const a = antwoordVoor.get(token) ?? { status: 200 };
            setImmediate(() => {
              stroom.emit("response", { ":status": a.status });
              if (a.reden) stroom.emit("data", JSON.stringify({ reason: a.reden }));
              stroom.emit("end");
            });
          };
          return stroom;
        },
      };
    },
  };
});

import { apnsConfig, apnsInhoud, apnsJwt, bewaarApnsToken, isApnsToken, leesP8, sendApnsToUsers, verwijderApnsToken } from "@/lib/notifications/push/apns";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const OMGEVING = { APNS_KEY_P8: PEM, APNS_KEY_ID: "ABC123DEFG", APNS_TEAM_ID: "TEAM123456" } as unknown as NodeJS.ProcessEnv;
const T1 = "a".repeat(64);
const T2 = "b".repeat(64);
const T3 = "c".repeat(64);
const BERICHT = { title: "Nieuwe shift", body: "Magazijn, Zwolle", data: { url: "/dashboard/klussen", tag: "shift-1", type: "SHIFT_OFFER" }, ttlSeconds: 900 };

beforeEach(() => {
  kv.clear();
  antwoordVoor.clear();
  verzoeken.length = 0;
  verbindingen = 0;
  for (const [k, v] of Object.entries(OMGEVING)) process.env[k] = String(v);
  delete process.env.APNS_SANDBOX;
  delete process.env.APNS_TOPIC;
});

describe("APNs: de sleutel en het token voor Apple", () => {
  it("leest de .p8 als PEM, met geschreven \\n, of als base64", () => {
    expect(leesP8(PEM)).toContain("BEGIN PRIVATE KEY");
    expect(leesP8(PEM.replace(/\n/g, "\\n")).trim()).toBe(PEM.trim());
    expect(leesP8(Buffer.from(PEM).toString("base64"))).toBe(PEM);
    expect(leesP8("onzin")).toBe("");
  });

  it("staat alleen aan met een geldige sleutel, Key ID en Team ID", () => {
    expect(apnsConfig(OMGEVING)?.host).toBe("https://api.push.apple.com");
    expect(apnsConfig(OMGEVING)?.topic).toBe("com.zekerflex.app");
    expect(apnsConfig({ ...OMGEVING, APNS_SANDBOX: "1" } as NodeJS.ProcessEnv)?.host).toBe("https://api.sandbox.push.apple.com");
    expect(apnsConfig({ ...OMGEVING, APNS_KEY_ID: "kort" } as NodeJS.ProcessEnv)).toBeNull();
    expect(apnsConfig({ ...OMGEVING, APNS_KEY_P8: "geen sleutel" } as NodeJS.ProcessEnv)).toBeNull();
    expect(apnsConfig({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("het token is een ES256-JWT die Apple met de publieke sleutel kan controleren", () => {
    const c = apnsConfig(OMGEVING)!;
    const jwt = apnsJwt(c, new Date("2026-11-09T21:00:00Z"));
    const [kop, inhoud, handtekening] = jwt.split(".");
    expect(JSON.parse(Buffer.from(kop!, "base64url").toString())).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(JSON.parse(Buffer.from(inhoud!, "base64url").toString())).toEqual({ iss: "TEAM123456", iat: 1794258000 });
    const ok = verify("sha256", Buffer.from(`${kop}.${inhoud}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(handtekening!, "base64url"));
    expect(ok).toBe(true);
  });

  it("de inhoud: melding in aps, url en type ernaast voor de app", () => {
    expect(JSON.parse(apnsInhoud(BERICHT))).toEqual({
      aps: { alert: { title: "Nieuwe shift", body: "Magazijn, Zwolle" }, sound: "default", "thread-id": "shift-1" },
      url: "/dashboard/klussen",
      tag: "shift-1",
      type: "SHIFT_OFFER",
    });
  });
});

describe("APNs: apparaatcodes per account", () => {
  it("alleen echte apparaatcodes (hex, minstens 64 tekens)", () => {
    expect(isApnsToken(T1)).toBe(true);
    expect(isApnsToken("A".repeat(64))).toBe(true);
    expect(isApnsToken("xyz")).toBe(false);
    expect(isApnsToken(`${T1};drop`)).toBe(false);
    expect(isApnsToken(42)).toBe(false);
  });

  it("nieuwste eerst, geen dubbele, hooguit vijf toestellen", async () => {
    for (const t of ["1", "2", "3", "4", "5", "6"]) await bewaarApnsToken("u1", t.repeat(64));
    await bewaarApnsToken("u1", "3".repeat(64));
    const tokens = (kv.get("apns:u1") as { tokens: { token: string }[] }).tokens.map((t) => t.token[0]);
    expect(tokens).toEqual(["3", "6", "5", "4", "2"]);
  });

  it("logt iemand anders in op dezelfde iPhone, dan gaat de code weg bij het vorige account", async () => {
    await bewaarApnsToken("u1", T1);
    await bewaarApnsToken("u1", T2);
    await bewaarApnsToken("u2", T1);
    expect((kv.get("apns:u1") as { tokens: { token: string }[] }).tokens.map((t) => t.token)).toEqual([T2]);
    expect((kv.get("apns:u2") as { tokens: { token: string }[] }).tokens.map((t) => t.token)).toEqual([T1]);
    await verwijderApnsToken("u2", T1);
    expect((kv.get("apns:u2") as { tokens: unknown[] }).tokens).toEqual([]);
  });
});

describe("APNs: verzenden", () => {
  it("stuurt naar elk toestel met de juiste kop, en ruimt codes op die Apple niet meer kent", async () => {
    await bewaarApnsToken("u1", T1);
    await bewaarApnsToken("u1", T2);
    await bewaarApnsToken("u2", T3);
    antwoordVoor.set(T2, { status: 410 });
    antwoordVoor.set(T3, { status: 400, reden: "BadDeviceToken" });
    const bereikt = await sendApnsToUsers(["u1", "u2"], BERICHT);
    expect(bereikt).toBe(1);
    expect(verbindingen).toBe(1);
    expect(verzoeken).toHaveLength(3);
    const kop = verzoeken[0]!.headers;
    expect(kop["apns-topic"]).toBe("com.zekerflex.app");
    expect(kop["apns-push-type"]).toBe("alert");
    expect(kop["apns-collapse-id"]).toBe("shift-1");
    expect(kop.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect((kv.get("apns:u1") as { tokens: { token: string }[] }).tokens.map((t) => t.token)).toEqual([T1]);
    expect((kv.get("apns:u2") as { tokens: unknown[] }).tokens).toEqual([]);
  });

  it("een andere fout (bijv. 429) laat de code staan", async () => {
    await bewaarApnsToken("u1", T1);
    antwoordVoor.set(T1, { status: 429, reden: "TooManyRequests" });
    expect(await sendApnsToUsers(["u1"], BERICHT)).toBe(0);
    expect((kv.get("apns:u1") as { tokens: unknown[] }).tokens).toHaveLength(1);
  });

  it("zonder sleutels of zonder toestellen: niets en geen verbinding", async () => {
    expect(await sendApnsToUsers(["u1"], BERICHT)).toBe(0);
    delete process.env.APNS_KEY_P8;
    await bewaarApnsToken("u1", T1);
    expect(await sendApnsToUsers(["u1"], BERICHT)).toBe(0);
    expect(verbindingen).toBe(0);
  });
});
