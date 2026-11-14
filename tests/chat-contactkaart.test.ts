import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// WhatsApp-uitbouw stap 12 (14 nov): een contact delen als kaartje. Alleen iemand met wie je zelf in contact staat (zo
// geef je niemand door die je niet kent), en de naam komt van de server, niet van de browser.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(v)]),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: "u_ik", fullName: "Ik" }) }));
const namen: Record<string, string> = { u_ik: "Ik", u_ander: "Ander", u_anna: "Anna Bakker", u_cor: "Cor", u_vreemd: "Vreemd" };
vi.mock("@/lib/messaging/contacts", () => ({
  isPlatformAdmin: async () => false,
  anyPlatformAdmin: async () => null,
  userDirectory: async (ids: string[]) => new Map(ids.filter((id) => namen[id]).map((id) => [id, { userId: id, name: namen[id]!, role: "freelancer" }])),
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

import { POST } from "@/app/api/inbox/[threadId]/route";
import { ensureDirectThread, getMessages, previewText } from "@/lib/messaging/store";
import { bekendenVan } from "@/lib/messaging/bekenden";

let draad = "";
const deel = (userId: string, naam = "Verzonnen naam") =>
  POST(new Request(`http://localhost/api/inbox/${draad}`, { method: "POST", body: JSON.stringify({ kind: "contact", text: naam, contact: { userId } }) }), { params: Promise.resolve({ threadId: draad }) });

beforeEach(async () => {
  kv.clear();
  kv.set("contacts:u_ik", { contacts: [{ userId: "u_anna" }] });
  draad = (await ensureDirectThread("u_ik", "u_ander")).id;
  await ensureDirectThread("u_ik", "u_cor");
});

describe("bekendenVan", () => {
  it("je bewaarde contacten en je gesprekspartners, zonder jezelf", async () => {
    expect([...(await bekendenVan("u_ik"))].sort()).toEqual(["u_anna", "u_ander", "u_cor"]);
  });
});

describe("een contactkaart sturen", () => {
  it("met de naam van de server, ook als de browser een andere stuurt", async () => {
    const res = await deel("u_anna");
    expect(res.status).toBe(201);
    const m = (await getMessages(draad)).at(-1)!;
    expect(m).toMatchObject({ kind: "contact", text: "Anna Bakker", contact: { userId: "u_anna", naam: "Anna Bakker" } });
    expect(previewText(m)).toBe("👤 Anna Bakker");
  });

  it("niet iemand die je niet kent, niet jezelf, en niet zonder ontvanger", async () => {
    expect((await deel("u_vreemd")).status).toBe(422);
    expect((await deel("u_ik")).status).toBe(422);
    const zonder = await POST(new Request(`http://localhost/api/inbox/${draad}`, { method: "POST", body: JSON.stringify({ kind: "contact", text: "x" }) }), { params: Promise.resolve({ threadId: draad }) });
    expect(zonder.status).toBe(422);
    expect((await getMessages(draad)).some((x) => x.kind === "contact")).toBe(false);
  });
});

describe("in de chat", () => {
  it("de kaart heeft Bericht sturen en Opslaan, behalve bij jezelf; doorsturen kan niet", () => {
    const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
    const bubbel = lees("components/chat/MessageBubble.tsx");
    expect(bubbel).toContain('{m.kind === "contact" && m.contact && (');
    expect(bubbel).toContain("{m.contact.userId !== myUserId && (onStartChat || onSaveContact) && (");
    expect(lees("app/api/inbox/forward/route.ts")).toContain('const FORWARDABLE = ["text", "image", "file", "voice", "location"];');
  });
});
