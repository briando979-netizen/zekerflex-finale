import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// WhatsApp-uitbouw stap 16 (15 nov): stickers, een eigen set zonder dienst van buiten. Elke sticker in de vaste lijst heeft
// een eigen svg (alleen vormen: geen tekst, geen scripts, niets van buiten) en een naam in vijf talen; de server neemt
// alleen een id uit de lijst aan (Object.hasOwn: "constructor" telt niet).

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvGetMany: async (keys: string[]) => new Map(keys.filter((k) => kv.has(k)).map((k) => [k, structuredClone(kv.get(k))])),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(v)]),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: "a", fullName: "Anna" }) }));
vi.mock("@/lib/messaging/contacts", () => ({
  isPlatformAdmin: async () => false,
  anyPlatformAdmin: async () => null,
  userDirectory: async (ids: string[]) => new Map(ids.map((id) => [id, { userId: id, name: id, role: "freelancer" }])),
}));
vi.mock("@/lib/messaging/presence", () => ({ getPresence: async () => ({}), touchPresence: async () => undefined, touchVisible: async () => undefined }));
vi.mock("@/lib/profile/store", () => ({ getUserAvatars: async () => ({}) }));
vi.mock("@/lib/messaging/settings", () => ({ getChatSettings: async () => ({ quickReplies: [] }), chatPrivacy: async () => ({ hideOnline: new Set(), noReceipts: new Set(), noPreview: new Set() }) }));
vi.mock("@/lib/messaging/auto-reply", () => ({ maybeAutoReply: async () => undefined }));
vi.mock("@/lib/messaging/notify", () => ({ notifyNewMessage: async () => undefined }));
vi.mock("@/lib/messaging/media", () => ({ ownChatUpload: async () => null }));
vi.mock("@/lib/agenda/scan", () => ({ scanChatMessage: async () => undefined }));
vi.mock("@/lib/messaging/link-voorbeeld-ophalen", () => ({ maakLinkVoorbeeld: async () => undefined }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => undefined }));

import { STICKER_IDS, isSticker, stickerSrc } from "@/lib/messaging/stickers";
import { previewText, type ChatMessage, type ChatThread } from "@/lib/messaging/store";
import { POST } from "@/app/api/inbox/[threadId]/route";
import { BUBBLE_NL } from "@/lib/chat/teksten-bubble";
import { BUBBLE_EN, BUBBLE_PL, BUBBLE_RO, BUBBLE_UK } from "@/lib/chat/teksten-bubble-talen";

const MAP = path.join(process.cwd(), "public", "chat-stickers");
const stuur = (body: unknown) => POST(new Request("http://localhost/api/inbox/t1", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ threadId: "t1" }) });

beforeEach(() => {
  kv.clear();
  kv.set("chat-thread:t1", { id: "t1", kind: "direct", participants: ["a", "b"], createdAt: "", lastMessageAt: "", lastMessage: null, meta: {}, reads: {} } as ChatThread);
});

describe("de set", () => {
  it("alleen ids uit de vaste lijst; ook niet wat elk object erft", () => {
    expect(isSticker("duim")).toBe(true);
    for (const v of ["constructor", "toString", "__proto__", "", 5, null]) expect(isSticker(v)).toBe(false);
    expect(stickerSrc("hart")).toBe("/chat-stickers/hart.svg");
  });

  it("elke sticker heeft precies één svg, en elke svg is een sticker; alleen vormen, niets van buiten, klein", () => {
    expect(readdirSync(MAP).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4)).sort()).toEqual([...STICKER_IDS].sort());
    for (const id of STICKER_IDS) {
      const svg = readFileSync(path.join(MAP, `${id}.svg`), "utf8");
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"'), id).toBe(true);
      expect(svg, id).not.toMatch(/<script|<text|<image|<foreignObject|href=|\son[a-z]+=/i);
      expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', ""), id).not.toMatch(/https?:/);
      expect(svg.length, id).toBeLessThan(6000);
    }
  });

  it("een naam per sticker in alle vijf talen (voor schermlezers)", () => {
    for (const t of [BUBBLE_NL, BUBBLE_EN, BUBBLE_PL, BUBBLE_RO, BUBBLE_UK]) {
      expect(Object.keys(t.stickerNamen).sort()).toEqual([...STICKER_IDS].sort());
      expect(Object.values(t.stickerNamen).every((n) => n.trim().length > 0)).toBe(true);
    }
  });
});

describe("versturen", () => {
  it("een sticker uit de set: 201, zonder tekst, voorvertoning ✨ Sticker", async () => {
    const res = await stuur({ kind: "sticker", text: "stiekem tekst", sticker: "koffie" });
    expect(res.status).toBe(201);
    const m = (await res.json()).message as ChatMessage;
    expect(m).toMatchObject({ kind: "sticker", sticker: "koffie", text: "" });
    expect(previewText(m)).toBe("✨ Sticker");
  });

  it("een onbekende of geen sticker: 422", async () => {
    expect((await stuur({ kind: "sticker", sticker: "constructor" })).status).toBe(422);
    expect((await stuur({ kind: "sticker", sticker: "../../etc/passwd" })).status).toBe(422);
    expect((await stuur({ kind: "sticker" })).status).toBe(422);
  });
});

describe("in de chat", () => {
  it("zonder ballon; doorsturen neemt de sticker mee; het menu heeft Sticker", () => {
    const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
    expect(lees("components/chat/MessageBubble.tsx")).toContain('m.kind === "sticker" ? "bg-transparent !shadow-none"');
    expect(lees("app/api/inbox/forward/route.ts")).toContain("if (src.sticker) extra.sticker = src.sticker;");
    expect(lees("components/chat/Composer.tsx")).toContain("label={chat.composer.menuSticker}");
  });
});
