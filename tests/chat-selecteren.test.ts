import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// WhatsApp-uitbouw stap 6 (13 nov): meerdere berichten tegelijk selecteren en kopiëren, bewaren, doorsturen of
// verwijderen. Voor jezelf verwijderen gaat in één verzoek (hide-messages, hooguit 100).

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(v)]),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: "a", fullName: "A" }) }));
vi.mock("@/lib/messaging/contacts", () => ({ isPlatformAdmin: async () => false }));

import { applyThreadAction, getChatPrefs, hiddenIn, HIDDEN_MAX } from "@/lib/messaging/thread-prefs";
import { POST as prefs } from "@/app/api/inbox/[threadId]/prefs/route";

const post = (body: unknown) =>
  prefs(new Request("http://localhost/api/inbox/t1/prefs", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ threadId: "t1" }) });

beforeEach(() => {
  kv.clear();
  kv.set("chat-thread:t1", { id: "t1", kind: "direct", participants: ["a", "b"], createdAt: "", lastMessageAt: "", lastMessage: null, meta: {}, reads: {} });
});

describe("meerdere berichten voor jezelf verwijderen", () => {
  it("in één keer, zonder dubbele, en nooit meer dan HIDDEN_MAX", async () => {
    await applyThreadAction("a", "t1", { action: "hide-message", messageId: "m1" });
    await applyThreadAction("a", "t1", { action: "hide-messages", messageIds: ["m1", "m2", "m3"] });
    expect([...hiddenIn(await getChatPrefs("a"), "t1")]).toEqual(["m1", "m2", "m3"]);
    await applyThreadAction("a", "t1", { action: "hide-messages", messageIds: Array.from({ length: HIDDEN_MAX }, (_, i) => `x${i}`) });
    expect((await getChatPrefs("a")).hiddenMsgs.t1).toHaveLength(HIDDEN_MAX);
  });

  it("de route neemt 1 tot 100 ids aan", async () => {
    expect((await post({ action: "hide-messages", messageIds: ["m1", "m2"] })).status).toBe(200);
    expect([...hiddenIn(await getChatPrefs("a"), "t1")]).toEqual(["m1", "m2"]);
    expect((await post({ action: "hide-messages", messageIds: [] })).status).toBe(422);
    expect((await post({ action: "hide-messages", messageIds: Array.from({ length: 101 }, (_, i) => `y${i}`) })).status).toBe(422);
  });
});

describe("waar het in de code zit", () => {
  const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

  it("in selectiemodus is de hele rij één knop met een vinkje; geen lang drukken of vegen", () => {
    const bubbel = lees("components/chat/MessageBubble.tsx");
    expect(bubbel).toContain("{selecting && onSelect && (");
    expect(bubbel).toContain("aria-pressed={selected}");
    expect(bubbel).toContain("if (selecting) return; // selecteren: een tik kiest, geen lang drukken of vegen");
    expect(bubbel).toContain("const hoverBar = selecting ? null : (");
    expect(bubbel).toContain('...(onSelect && !selecting && !m.pending ? [{ key: "select", label: t.select');
  });

  it("de balk vervangt de invoer; voor iedereen alleen als alles van jou is en binnen 48 uur", () => {
    const inbox = lees("components/chat/InboxPage.tsx");
    expect(inbox).toContain(") : selectie ? (\n            <SelectieBalk");
    expect(inbox).toContain("kanVoorIedereen={gekozen.length > 0 && gekozen.every((m) => canDeleteForAll(m, me?.userId))}");
    expect(inbox).toContain('body: JSON.stringify({ action: "hide-messages", messageIds: weg.slice(0, 100) }),');
    // doorsturen: dezelfde soorten als de server
    const route = lees("app/api/inbox/forward/route.ts");
    expect(route).toContain('const FORWARDABLE = ["text", "image", "file", "voice", "location"];');
    expect(inbox).toContain('const FORWARDABLE: Msg["kind"][] = ["text", "image", "file", "voice", "location"];');
  });
});
