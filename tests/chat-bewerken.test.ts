import { beforeEach, describe, expect, it, vi } from "vitest";

// De chat staat in KV; een geheugen-KV volstaat om bewerken te testen.
const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(v)]),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));

import { editMessage, getMessages, getThread, postMessage, type ChatThread } from "@/lib/messaging/store";

const thread = (): ChatThread => ({
  id: "t1",
  kind: "direct",
  participants: ["a", "b"],
  createdAt: "2026-11-04T08:00:00.000Z",
  lastMessageAt: "2026-11-04T08:00:00.000Z",
  lastMessage: null,
  meta: {},
  reads: {},
} as ChatThread);

beforeEach(() => {
  kv.clear();
  kv.set("chat-thread:t1", thread());
});

describe("editMessage", () => {
  it("zet de nieuwe tekst en de bewerktijd, en houdt de oorspronkelijke tijd", async () => {
    const m = await postMessage("t1", "a", "Ik ben er om 9 uur");
    const nu = new Date("2026-11-04T09:15:00.000Z");
    const e = await editMessage("t1", m.id, "  Ik ben er om half 10  ", nu);
    expect(e).toMatchObject({ text: "Ik ben er om half 10", editedAt: nu.toISOString(), at: m.at });
    expect((await getMessages("t1"))[0]).toMatchObject({ text: "Ik ben er om half 10", editedAt: nu.toISOString() });
  });

  it("werkt de voorvertoning in de gesprekkenlijst bij als het het laatste bericht was", async () => {
    await postMessage("t1", "b", "Hoe laat ben je er?");
    const m = await postMessage("t1", "a", "Om 9 uur");
    await editMessage("t1", m.id, "Om half 10");
    expect((await getThread("t1"))?.lastMessage?.text).toBe("Om half 10");
  });

  it("laat een eerder bericht de voorvertoning ongemoeid", async () => {
    const eerste = await postMessage("t1", "a", "Hallo");
    await postMessage("t1", "b", "Hoi!");
    await editMessage("t1", eerste.id, "Goedemorgen");
    expect((await getThread("t1"))?.lastMessage?.text).toBe("Hoi!");
  });

  it("bewerkt geen verwijderd bericht, geen systeembericht en geen onbekend bericht", async () => {
    const sys = await postMessage("t1", "system", "De klus is aangepast", "system");
    expect(await editMessage("t1", sys.id, "anders")).toBeNull();
    expect(await editMessage("t1", "bestaat-niet", "anders")).toBeNull();
    const m = await postMessage("t1", "a", "weg ermee");
    const list = (kv.get("chat-messages:t1") as { id: string; deleted?: boolean }[]).map((x) => (x.id === m.id ? { ...x, deleted: true } : x));
    kv.set("chat-messages:t1", list);
    expect(await editMessage("t1", m.id, "toch niet")).toBeNull();
  });

  it("weigert een lege tekst", async () => {
    const m = await postMessage("t1", "a", "iets");
    await expect(editMessage("t1", m.id, "   ")).rejects.toThrow();
  });
});
