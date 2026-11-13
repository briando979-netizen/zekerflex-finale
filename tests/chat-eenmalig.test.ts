import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// WhatsApp-uitbouw stap 11 (13 nov): een foto die je maar één keer kunt bekijken. De ontvanger opent hem één keer
// (?eenmalig=1, vastgelegd), daarna 410; de afzender ziet hem na het versturen niet meer; geen kleine versie, geen
// cache, niet doorsturen en niet in het media-overzicht.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(v)]),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));
let wie = "b";
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: wie, fullName: wie }) }));
vi.mock("@/lib/messaging/contacts", () => ({ isPlatformAdmin: async () => false }));
vi.mock("@/lib/messaging/media", () => ({
  readChatMedia: async () => ({ bytes: Buffer.from("JPEG-bytes"), filename: "foto.jpg", mimeType: "image/jpeg" }),
  opensInline: () => true,
}));

import { markeerEenmaligGezien, postMessage, type ChatThread } from "@/lib/messaging/store";
import { GET as media } from "@/app/api/inbox/[threadId]/media/[mediaId]/route";
import { POST as forward } from "@/app/api/inbox/forward/route";
import { mediaOverzicht } from "@/components/chat/media-overzicht";
import type { Msg } from "@/components/chat/shared";

const draad = (id: string) => ({ id, kind: "direct", participants: ["a", "b"], createdAt: "", lastMessageAt: "", lastMessage: null, meta: {}, reads: {} }) as ChatThread;
const foto = (mediaId: string) => ({ attachment: { mediaId, filename: "foto.jpg", mimeType: "image/jpeg", sizeBytes: 10 } });
const haal = (mediaId: string, zoek = "") =>
  media(new Request(`http://localhost/api/inbox/t1/media/${mediaId}${zoek}`), { params: Promise.resolve({ threadId: "t1", mediaId }) });

beforeEach(() => {
  kv.clear();
  kv.set("chat-thread:t1", draad("t1"));
  kv.set("chat-thread:t2", draad("t2"));
  wie = "b";
});

describe("eenmalig in het bericht", () => {
  it("alleen een foto kan eenmalig zijn", async () => {
    expect((await postMessage("t1", "a", "", "image", { ...foto("m1"), eenmalig: true })).eenmalig).toBe(true);
    expect((await postMessage("t1", "a", "hoi", "text", { eenmalig: true })).eenmalig).toBeUndefined();
  });

  it("de eerste keer ok, daarna al gezien; de afzender telt als al gezien", async () => {
    await postMessage("t1", "a", "", "image", { ...foto("m1"), eenmalig: true });
    expect(await markeerEenmaligGezien("t1", "m1", "b")).toBe("ok");
    expect(await markeerEenmaligGezien("t1", "m1", "b")).toBe("al");
    expect(await markeerEenmaligGezien("t1", "m1", "a")).toBe("al");
    expect(await markeerEenmaligGezien("t1", "bestaat-niet", "b")).toBe("geen");
  });
});

describe("de media-route", () => {
  it("de ontvanger opent hem één keer, zonder cache; daarna 410", async () => {
    await postMessage("t1", "a", "", "image", { ...foto("m1"), eenmalig: true });
    expect((await haal("m1")).status).toBe(404); // geen gewone of kleine versie
    expect((await haal("m1", "?klein=1")).status).toBe(404);
    const eerst = await haal("m1", "?eenmalig=1");
    expect(eerst.status).toBe(200);
    expect(eerst.headers.get("cache-control")).toBe("private, no-store");
    expect((await eerst.arrayBuffer()).byteLength).toBe(10);
    expect((await haal("m1", "?eenmalig=1")).status).toBe(410);
  });

  it("de afzender ziet hem na het versturen niet meer", async () => {
    await postMessage("t1", "a", "", "image", { ...foto("m1"), eenmalig: true });
    wie = "a";
    expect((await haal("m1", "?eenmalig=1")).status).toBe(404);
  });

  it("een gewone foto werkt zoals altijd", async () => {
    await postMessage("t1", "a", "", "image", foto("m2"));
    const res = await haal("m2");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
  });
});

describe("doorsturen en het media-overzicht", () => {
  it("een eenmalige foto kun je niet doorsturen", async () => {
    const m = await postMessage("t1", "a", "", "image", { ...foto("m1"), eenmalig: true });
    const res = await forward(new Request("http://localhost/api/inbox/forward", { method: "POST", body: JSON.stringify({ fromThreadId: "t1", messageId: m.id, toThreadId: "t2" }) }));
    expect(res.status).toBe(422);
  });

  it("het media-overzicht laat hem weg", () => {
    const o = mediaOverzicht([{ id: "x", threadId: "t1", from: "a", at: "2026-11-13T12:00:00+01:00", text: "", kind: "image", eenmalig: true, ...foto("m1") } as Msg]);
    expect(o.media).toEqual([]);
  });
});

describe("in de chat", () => {
  const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

  it("de bubbel toont geen foto, alleen een knop; doorsturen en de ster ontbreken; de invoer heeft 1×", () => {
    const bubbel = lees("components/chat/MessageBubble.tsx");
    expect(bubbel).toContain('{m.kind === "image" && !m.eenmalig && mediaUrl &&');
    expect(bubbel).toContain('m.kind !== "poll" && !m.eenmalig ?');
    expect(bubbel).toContain("...(onStar && !m.pending && !m.eenmalig");
    expect(lees("components/chat/Composer.tsx")).toContain("aria-pressed={eenmalig}");
    expect(lees("components/chat/InboxPage.tsx")).toContain("?eenmalig=1`, { cache: \"no-store\" })");
  });
});
