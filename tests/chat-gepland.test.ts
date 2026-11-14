import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WhatsApp-uitbouw stap 17 (15 nov): later versturen. Inplannen in Nederlandse tijd (bewaard in UTC), alleen je eigen
// geplande berichten zien en annuleren, de cron verstuurt elke minuut wat aan de beurt is: één keer (eerst claimen), en
// alleen als het dan nog mag (deelnemer, niet geblokkeerd).

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvGetMany: async (keys: string[]) => new Map(keys.filter((k) => kv.has(k)).map((k) => [k, structuredClone(kv.get(k))])),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvListKeys: async (prefix: string) => [...kv.keys()].filter((k) => k.startsWith(prefix)),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
  kvFindDue: async (prefix: string, veld: string, voor: string) =>
    [...kv.entries()].filter(([k, v]) => k.startsWith(prefix) && String((v as Record<string, unknown>)[veld]) <= voor).map(([key, value]) => ({ key, value: structuredClone(value) })),
  kvVerwijderAlsVeld: async (k: string, veld: string, waarde: string) => {
    const v = kv.get(k) as Record<string, unknown> | undefined;
    if (!v || v[veld] !== waarde) return false;
    kv.delete(k);
    return true;
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
let wie = "a";
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: wie, fullName: wie }) }));
vi.mock("@/lib/messaging/contacts", () => ({ isPlatformAdmin: async () => false }));
const gemeld = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/messaging/notify", () => ({ notifyNewMessage: async (_t: unknown, m: { text: string }) => void gemeld.push(m.text) }));

import { geplandeTijd, GEPLAND_MAX_PER_PERSOON } from "@/lib/messaging/gepland-tijd";
import { verstuurGepland } from "@/lib/messaging/gepland";
import { getMessages, type ChatThread } from "@/lib/messaging/store";
import { DELETE, GET, POST } from "@/app/api/inbox/[threadId]/gepland/route";
import { ERASABLE_KV_PREFIXES } from "@/lib/privacy/user-kv";

const NU = new Date("2026-11-15T12:00:00+01:00");
const ctx = (threadId = "t1") => ({ params: Promise.resolve({ threadId }) });
const plan = (body: unknown, threadId = "t1") => POST(new Request(`http://localhost/api/inbox/${threadId}/gepland`, { method: "POST", body: JSON.stringify(body) }), ctx(threadId));
const lijst = async (threadId = "t1") => (await (await GET(new Request(`http://localhost/api/inbox/${threadId}/gepland`), ctx(threadId))).json()).gepland as { id: string; text: string; sendAt: string }[];
const schrap = (id: string) => DELETE(new Request(`http://localhost/api/inbox/t1/gepland?id=${id}`, { method: "DELETE" }), ctx());
const draad = (id: string, participants: string[]) =>
  kv.set(`chat-thread:${id}`, { id, kind: "direct", participants, createdAt: "", lastMessageAt: "", lastMessage: null, meta: {}, reads: {} } as ChatThread);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
  kv.clear();
  gemeld.length = 0;
  draad("t1", ["a", "b"]);
  draad("t2", ["a", "c"]);
  wie = "a";
});
afterEach(() => {
  vi.useRealTimers();
});

describe("de tijd", () => {
  it("Nederlandse tijd in, UTC uit; vanaf over een minuut tot over 30 dagen", () => {
    expect(geplandeTijd("2026-11-15T14:00", NU)?.toISOString()).toBe("2026-11-15T13:00:00.000Z");
    expect(geplandeTijd("2026-11-15T12:00", NU)).toBeNull();
    expect(geplandeTijd("2026-11-15T12:01", NU)?.toISOString()).toBe("2026-11-15T11:01:00.000Z");
    expect(geplandeTijd("2026-12-15T12:00", NU)?.toISOString()).toBe("2026-12-15T11:00:00.000Z");
    expect(geplandeTijd("2026-12-15T12:01", NU)).toBeNull();
    expect(geplandeTijd("morgen", NU)).toBeNull();
  });
});

describe("inplannen, zien en annuleren", () => {
  it("201 met de tijd in UTC; alleen jouw berichten in dit gesprek", async () => {
    const res = await plan({ text: "  Vergeet je helm niet  ", wanneer: "2026-11-16T07:30" });
    expect(res.status).toBe(201);
    expect((await res.json()).gepland).toMatchObject({ text: "Vergeet je helm niet", sendAt: "2026-11-16T06:30:00.000Z", threadId: "t1", userId: "a" });
    await plan({ text: "Ander gesprek", wanneer: "2026-11-16T08:00" }, "t2");
    wie = "b";
    await plan({ text: "Van B", wanneer: "2026-11-16T09:00" });
    expect((await lijst()).map((g) => g.text)).toEqual(["Van B"]);
    wie = "a";
    expect((await lijst()).map((g) => g.text)).toEqual(["Vergeet je helm niet"]);
  });

  it("geen tekst, een foute tijd, geblokkeerd of te veel: 422; geen toegang: 404", async () => {
    expect((await plan({ text: "  ", wanneer: "2026-11-16T07:30" })).status).toBe(422);
    expect((await plan({ text: "x", wanneer: "2026-11-15T11:00" })).status).toBe(422);
    kv.set("chat-prefs:b", { blocked: ["a"] });
    expect((await plan({ text: "x", wanneer: "2026-11-16T07:30" })).status).toBe(422);
    kv.delete("chat-prefs:b");
    for (let i = 0; i < GEPLAND_MAX_PER_PERSOON; i++) expect((await plan({ text: `nr ${i}`, wanneer: "2026-11-16T07:30" })).status).toBe(201);
    expect((await plan({ text: "één te veel", wanneer: "2026-11-16T07:30" })).status).toBe(422);
    wie = "c";
    expect((await plan({ text: "x", wanneer: "2026-11-16T07:30" })).status).toBe(404);
  });

  it("annuleren: alleen je eigen; daarna 404; een onzin-id 422", async () => {
    const { gepland } = await (await plan({ text: "Weg ermee", wanneer: "2026-11-16T07:30" })).json();
    wie = "b";
    expect((await schrap(gepland.id)).status).toBe(404);
    wie = "a";
    expect((await schrap(gepland.id)).status).toBe(200);
    expect((await schrap(gepland.id)).status).toBe(404);
    expect((await schrap("../../x")).status).toBe(422);
    expect(await lijst()).toEqual([]);
  });
});

describe("de cron", () => {
  it("verstuurt wat aan de beurt is, één keer, met een melding; de rest wacht", async () => {
    await plan({ text: "Om half acht", wanneer: "2026-11-16T07:30" });
    await plan({ text: "Om negen", wanneer: "2026-11-16T09:00" });
    vi.setSystemTime(new Date("2026-11-16T07:30:20+01:00"));
    expect(await verstuurGepland()).toEqual({ verstuurd: 1, vervallen: 0 });
    expect(await verstuurGepland()).toEqual({ verstuurd: 0, vervallen: 0 });
    const berichten = await getMessages("t1");
    expect(berichten.map((m) => [m.from, m.text, m.kind])).toEqual([["a", "Om half acht", "text"]]);
    expect(gemeld).toEqual(["Om half acht"]);
    expect((await lijst()).map((g) => g.text)).toEqual(["Om negen"]);
  });

  it("geblokkeerd of uit het gesprek: vervalt, wordt niet verstuurd", async () => {
    await plan({ text: "Geblokkeerd", wanneer: "2026-11-16T07:30" });
    await plan({ text: "Uit het gesprek", wanneer: "2026-11-16T07:30" }, "t2");
    kv.set("chat-prefs:b", { blocked: ["a"] });
    draad("t2", ["c"]);
    vi.setSystemTime(new Date("2026-11-16T08:00:00+01:00"));
    expect(await verstuurGepland()).toEqual({ verstuurd: 0, vervallen: 2 });
    expect(await getMessages("t1")).toEqual([]);
    expect([...kv.keys()].some((k) => k.startsWith("chat-gepland:"))).toBe(false);
  });
});

describe("ingepland op de server", () => {
  it("de cron elke minuut, een hartslag, inzage en wissen", () => {
    const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
    expect(lees("deploy/cron/entrypoint.sh")).toContain('* * * * * wget -q -O /dev/null -T 50 "$H" "$APP/api/internal/chat/gepland"');
    expect(lees("lib/ops/heartbeat.ts")).toContain('{ job: "chat-gepland", label: "Chat: geplande berichten versturen", maxAgeHours: 1 }');
    expect(lees("app/api/internal/chat/gepland/route.ts")).toContain("checkInternalToken(request)");
    expect(ERASABLE_KV_PREFIXES).toContain("chat-gepland:");
  });
});
