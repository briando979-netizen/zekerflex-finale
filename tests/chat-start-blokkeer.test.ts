import { beforeEach, describe, expect, it, vi } from "vitest";

// Fix 13 nov: POST /api/inbox (een gesprek beginnen en het eerste bericht sturen) controleerde het blokkeren niet. Omdat
// er één gesprek per tweetal is, kon iemand die je geblokkeerd had je zo toch een bericht sturen. Nu wordt het
// geweigerd, in beide richtingen, en moet de ontvanger bestaan.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(v)]),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));
let wie = "u_lastig";
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: wie, fullName: wie }) }));
const bestaat = new Set(["u_lastig", "u_jan", "u_bol"]);
vi.mock("@/lib/messaging/contacts", () => ({
  isPlatformAdmin: async () => false,
  resolveShiftContact: async () => null,
  userDirectory: async (ids: string[]) => new Map(ids.filter((id) => bestaat.has(id)).map((id) => [id, { userId: id, name: id, role: "freelancer" }])),
}));
vi.mock("@/lib/messaging/auto-reply", () => ({ maybeAutoReply: async () => undefined }));
vi.mock("@/lib/messaging/notify", () => ({ notifyNewMessage: async () => undefined }));
vi.mock("@/lib/agenda/scan", () => ({ scanChatMessage: async () => undefined }));
vi.mock("@/lib/ops/usage", () => ({ withUsage: (_n: string, h: (...a: unknown[]) => unknown) => h }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => undefined }));

import { POST } from "@/app/api/inbox/route";
import { setBlocked } from "@/lib/messaging/thread-prefs";

const begin = (toUserId: string) => POST(new Request("http://localhost/api/inbox", { method: "POST", body: JSON.stringify({ toUserId, text: "Hallo" }) }));
const berichten = () => [...kv.entries()].filter(([k]) => k.startsWith("chat-messages:")).flatMap(([, v]) => v as unknown[]).length;

beforeEach(() => {
  kv.clear();
  wie = "u_lastig";
});

describe("een gesprek beginnen", () => {
  it("geweigerd als de ander jou blokkeerde, en er komt geen bericht", async () => {
    await setBlocked("u_jan", "u_lastig", true);
    expect((await begin("u_jan")).status).toBe(403);
    expect(berichten()).toBe(0);
  });

  it("geweigerd als jij de ander blokkeerde", async () => {
    await setBlocked("u_lastig", "u_bol", true);
    expect((await begin("u_bol")).status).toBe(403);
    expect(berichten()).toBe(0);
  });

  it("een onbekende ontvanger: 404", async () => {
    expect((await begin("u_bestaat_niet")).status).toBe(404);
    expect(berichten()).toBe(0);
  });

  it("zonder blokkade gewoon 201", async () => {
    expect((await begin("u_jan")).status).toBe(201);
    expect(berichten()).toBe(1);
  });
});
