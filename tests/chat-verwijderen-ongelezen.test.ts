import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WhatsApp-uitbouw stap 1 (13 nov): "Verwijderen voor mij", voor iedereen verwijderen tot 48 uur, en
// "Markeer als (on)gelezen". Plus een lek in de chatinstellingen: een gedeeld leeg object nam de "Wis chat" van de
// ene gebruiker zonder instellingen mee naar de volgende.

const kv = new Map<string, unknown>();
const kvSet = vi.fn(async (k: string, v: unknown) => void kv.set(k, structuredClone(v)));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: (k: string, v: unknown) => kvSet(k, v),
  kvDelete: async (k: string) => void kv.delete(k),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(v)]),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));
let wie = "a";
let beheer = false;
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: wie, fullName: wie.toUpperCase() }) }));
vi.mock("@/lib/messaging/contacts", () => ({ isPlatformAdmin: async () => beheer }));

import { applyThreadAction, clearUnreadMark, getChatPrefs, hiddenIn, HIDDEN_MAX } from "@/lib/messaging/thread-prefs";
import { DELETE_WINDOW_MS as SERVER_DELETE, EDIT_WINDOW_MS as SERVER_EDIT, getMessages, postMessage, type ChatThread } from "@/lib/messaging/store";
import { canDeleteForAll, DELETE_WINDOW_MS, EDIT_WINDOW_MS, isOngelezen, type Msg } from "@/components/chat/shared";
import { POST as verwijder } from "@/app/api/inbox/[threadId]/delete/route";
import { POST as prefs } from "@/app/api/inbox/[threadId]/prefs/route";

const thread = (): ChatThread =>
  ({ id: "t1", kind: "direct", participants: ["a", "b"], createdAt: "2026-11-13T08:00:00.000Z", lastMessageAt: "2026-11-13T08:00:00.000Z", lastMessage: null, meta: {}, reads: {} }) as ChatThread;
const post = (route: typeof verwijder, body: unknown) =>
  route(new Request("http://localhost/api/inbox/t1/x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ threadId: "t1" }) });

beforeEach(() => {
  kv.clear();
  kvSet.mockClear();
  kv.set("chat-thread:t1", thread());
  wie = "a";
  beheer = false;
});
afterEach(() => vi.useRealTimers());

describe("chatinstellingen per gebruiker", () => {
  it("een gebruiker zonder instellingen neemt niets over van een andere (geen gedeeld leeg object)", async () => {
    await applyThreadAction("a", "t1", { action: "clear" });
    await applyThreadAction("a", "t1", { action: "mute", hours: 8 });
    await applyThreadAction("a", "t1", { action: "hide-message", messageId: "m1" });
    const b = await getChatPrefs("b");
    expect(b.clearedAt).toEqual({});
    expect(b.muted).toEqual({});
    expect(b.hiddenMsgs).toEqual({});
  });

  it("Verwijderen voor mij: alleen in je eigen weergave, hooguit HIDDEN_MAX per gesprek, en Wis chat ruimt ze op", async () => {
    await applyThreadAction("a", "t1", { action: "hide-message", messageId: "m1" });
    await applyThreadAction("a", "t1", { action: "hide-message", messageId: "m1" });
    expect([...hiddenIn(await getChatPrefs("a"), "t1")]).toEqual(["m1"]);
    expect(hiddenIn(await getChatPrefs("b"), "t1").size).toBe(0);
    for (let i = 0; i < HIDDEN_MAX + 5; i++) await applyThreadAction("a", "t1", { action: "hide-message", messageId: `x${i}` });
    const veel = (await getChatPrefs("a")).hiddenMsgs.t1 ?? [];
    expect(veel).toHaveLength(HIDDEN_MAX);
    expect(veel.at(-1)).toBe(`x${HIDDEN_MAX + 4}`);
    await applyThreadAction("a", "t1", { action: "clear" });
    expect((await getChatPrefs("a")).hiddenMsgs.t1).toBeUndefined();
  });

  it("Markeer als ongelezen blijft tot je het gesprek opent; openen schrijft alleen als er een markering is", async () => {
    await applyThreadAction("a", "t1", { action: "mark-unread" });
    expect((await getChatPrefs("a")).unreadMark).toEqual(["t1"]);
    kvSet.mockClear();
    await clearUnreadMark("a", "t1");
    expect((await getChatPrefs("a")).unreadMark).toEqual([]);
    expect(kvSet).toHaveBeenCalledTimes(1);
    await clearUnreadMark("a", "t1"); // niets gemarkeerd: geen schrijfactie bij elke poll
    expect(kvSet).toHaveBeenCalledTimes(1);
  });

  it("isOngelezen: echte ongelezen berichten of een markering", () => {
    expect(isOngelezen({ unread: 0 })).toBe(false);
    expect(isOngelezen({ unread: 2 })).toBe(true);
    expect(isOngelezen({ unread: 0, gemarkeerd: true })).toBe(true);
  });
});

describe("voor iedereen verwijderen", () => {
  it("de browser en de server houden dezelfde termijnen aan", () => {
    expect(DELETE_WINDOW_MS).toBe(SERVER_DELETE);
    expect(EDIT_WINDOW_MS).toBe(SERVER_EDIT);
    expect(DELETE_WINDOW_MS).toBe(48 * 3_600_000);
  });

  it("canDeleteForAll: alleen je eigen bericht, binnen 48 uur", () => {
    const nu = Date.parse("2026-11-13T12:00:00+01:00");
    const m = (over: Partial<Msg>): Msg => ({ id: "m", threadId: "t1", from: "a", at: "2026-11-12T12:00:00+01:00", text: "x", kind: "text", ...over }) as Msg;
    expect(canDeleteForAll(m({}), "a", nu)).toBe(true);
    expect(canDeleteForAll(m({ at: "2026-11-11T11:00:00+01:00" }), "a", nu)).toBe(false);
    expect(canDeleteForAll(m({}), "b", nu)).toBe(false);
    expect(canDeleteForAll(m({ deleted: true }), "a", nu)).toBe(false);
  });

  it("de route weigert na 48 uur (422) en laat beheer altijd toe", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T12:00:00+01:00"));
    const oud = await postMessage("t1", "a", "dit stond er al lang");
    vi.setSystemTime(new Date("2026-11-13T12:00:00+01:00"));
    const res = await post(verwijder, { messageId: oud.id });
    expect(res.status).toBe(422);
    expect((await getMessages("t1"))[0]?.deleted).toBeUndefined();
    beheer = true;
    expect((await post(verwijder, { messageId: oud.id })).status).toBe(200);
    expect((await getMessages("t1"))[0]?.deleted).toBe(true);
  });

  it("binnen 48 uur trekt de afzender zijn bericht gewoon in", async () => {
    const m = await postMessage("t1", "a", "oeps");
    expect((await post(verwijder, { messageId: m.id })).status).toBe(200);
    expect((await getMessages("t1"))[0]?.deleted).toBe(true);
  });
});

describe("de prefs-route", () => {
  it("hide-message en mark-unread/mark-read werken alleen op je eigen weergave", async () => {
    const m = await postMessage("t1", "b", "hallo");
    expect((await post(prefs, { action: "hide-message", messageId: m.id })).status).toBe(200);
    expect([...hiddenIn(await getChatPrefs("a"), "t1")]).toEqual([m.id]);
    expect((await getMessages("t1"))[0]?.deleted).toBeUndefined(); // het bericht zelf blijft bestaan
    expect((await post(prefs, { action: "mark-unread" })).status).toBe(200);
    expect((await getChatPrefs("a")).unreadMark).toEqual(["t1"]);
    expect((await post(prefs, { action: "mark-read" })).status).toBe(200);
    expect((await getChatPrefs("a")).unreadMark).toEqual([]);
    expect(((kv.get("chat-thread:t1") as ChatThread).reads.a ?? "") > "").toBe(true); // ook echt gelezen
    expect((await post(prefs, { action: "hide-message" })).status).toBe(422);
  });
});

describe("waar het in de code zit", () => {
  const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

  it("het gesprek en de lijst laten verborgen berichten weg; openen haalt de markering weg", () => {
    const gesprek = lees("app/api/inbox/[threadId]/route.ts");
    expect(gesprek).toContain("(!from || m.at > from) && !hidden.has(m.id)");
    expect(gesprek).toContain("if (prefs.unreadMark.includes(thread.id)) await clearUnreadMark(p.userId, thread.id);");
    const lijst = lees("app/api/inbox/route.ts");
    expect(lijst).toContain("(!from || m.at > from) && !hidden.has(m.id)");
    expect(lijst).toContain("const gemarkeerd = unread === 0 && prefs.unreadMark.includes(t.id);");
  });

  it("de bubbel biedt voor iedereen verwijderen alleen binnen de termijn, en voor mij altijd", () => {
    const bubbel = lees("components/chat/MessageBubble.tsx");
    expect(bubbel).toContain("...(mine && onDelete && canDeleteForAll(m, myUserId)");
    expect(bubbel).toContain("...(onHide && !m.pending");
  });
});
