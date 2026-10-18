import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvListValues: async (p: string) => [...kv.entries()].filter(([k]) => k.startsWith(p)).map(([, v]) => v),
  kvFindByField: async (p: string, f: string, eq: string) => [...kv.entries()].filter(([k, v]) => k.startsWith(p) && (v as Record<string, unknown>)[f] === eq).map(([, v]) => v),
}));

import { appendMessage, getConversation, isConversationId, listConversations, markRead, setStatus } from "@/lib/chat/webchat";

const ID = "wc-abcdef1234567890abcd";

beforeEach(() => kv.clear());

describe("website-chat tickets", () => {
  it("keeps the conversation, counts unread visitor messages", async () => {
    await appendMessage(ID, { role: "user", content: "hoi" }, "/prijzen");
    await appendMessage(ID, { role: "assistant", content: "Goedemiddag!" });
    await appendMessage(ID, { role: "user", content: "kan ik iemand spreken?" });
    const c = await getConversation(ID);
    expect(c).toMatchObject({ status: "open", unread: 2, page: "/prijzen" });
    expect(c!.messages).toHaveLength(3);
    await markRead(ID);
    expect((await getConversation(ID))!.unread).toBe(0);
  });

  it("an agent takeover is visible, and a visitor re-opens a closed ticket", async () => {
    await appendMessage(ID, { role: "user", content: "vraag" });
    await setStatus(ID, "human");
    expect((await listConversations("human")).map((c) => c.id)).toEqual([ID]);
    await setStatus(ID, "closed");
    await appendMessage(ID, { role: "user", content: "nog een vraag" });
    expect((await getConversation(ID))!.status).toBe("open");
  });

  it("only accepts proper tokens as ids", () => {
    expect(isConversationId(ID)).toBe(true);
    expect(isConversationId("../../etc")).toBe(false);
    expect(isConversationId("short")).toBe(false);
  });
});
