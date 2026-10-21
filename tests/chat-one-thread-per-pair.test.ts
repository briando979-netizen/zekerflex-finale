import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the KeyValueStore the chat lives in.
const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
  kvAppend: async (k: string, item: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(item)]),
}));

const store = await import("@/lib/messaging/store");

beforeEach(() => kv.clear());

describe("one conversation per pair of people", () => {
  it("reuses the pair's thread for a new klus and only updates its subject", async () => {
    const a = await store.ensureDirectThread("jan", "briando", { contextKey: "shift:1", shiftId: "1", shiftTitle: "Bediening" });
    const b = await store.ensureDirectThread("briando", "jan", { contextKey: "shift:2", shiftId: "2", shiftTitle: "Schoonmaak" });
    expect(b.id).toBe(a.id);
    expect((await store.getThread(a.id))?.meta.shiftTitle).toBe("Schoonmaak");
  });

  it("merges old duplicates into one main thread, in time order, and keeps old links working", async () => {
    // simulate the old behaviour: two threads for the same pair
    const t1 = { id: "t1", kind: "direct", participants: ["jan", "briando"], createdAt: "2026-09-01T00:00:00Z", lastMessageAt: "2026-09-02T00:00:00Z", lastMessage: null, meta: { contextKey: "shift:1" }, reads: {} };
    const t2 = { id: "t2", kind: "direct", participants: ["briando", "jan"], createdAt: "2026-09-05T00:00:00Z", lastMessageAt: "2026-09-06T00:00:00Z", lastMessage: null, meta: { contextKey: "shift:2", shiftTitle: "Nieuw" }, reads: {} };
    kv.set("chat-thread:t1", t1);
    kv.set("chat-thread:t2", t2);
    kv.set("chat-messages:t1", [
      { id: "m1", threadId: "t1", from: "jan", at: "2026-09-01T10:00:00Z", text: "hoi", kind: "text" },
      { id: "m3", threadId: "t1", from: "jan", at: "2026-09-03T10:00:00Z", text: "later", kind: "text" },
    ]);
    kv.set("chat-messages:t2", [{ id: "m2", threadId: "t2", from: "briando", at: "2026-09-02T10:00:00Z", text: "hallo", kind: "text" }]);

    const r = await store.mergeDuplicateDirectThreads();
    expect(r).toEqual({ pairs: 1, merged: 1, messagesMoved: 1 });

    const msgs = await store.getMessages("t1");
    expect(msgs.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(kv.has("chat-thread:t2")).toBe(false);
    // the old link to t2 now opens the main thread, and new messages land there
    expect((await store.getThread("t2"))?.id).toBe("t1");
    await store.postMessage("t2", "jan", "via oude link");
    expect((await store.getMessages("t1")).at(-1)?.text).toBe("via oude link");
    expect((await store.listThreadsForUser("jan", false)).length).toBe(1);
  });
});
