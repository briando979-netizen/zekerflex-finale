import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// WhatsApp-uitbouw stap 14 (15 nov): live locatie. 15 min, 1 uur of 8 uur; alleen de afzender werkt bij, hooguit eens per
// 10 s; de plek die meeschuift staat in een eigen sleutel (niet elke keer de hele berichtenlijst herschrijven); bij stoppen
// of verlopen gaat de laatste plek in het bericht en verdwijnt de sleutel. Doorsturen geeft alleen de plek van dat moment.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvGetMany: async (keys: string[]) => new Map(keys.filter((k) => kv.has(k)).map((k) => [k, structuredClone(kv.get(k))])),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(v)]),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
let wie = "a";
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: wie, fullName: wie === "a" ? "Anna" : "Bas" }) }));
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

import { MIN_TUSSEN_SEC, startLive, stopLive, vastePlek, werkLiveBij } from "@/lib/messaging/live-locatie";
import { deleteMessage, getMessages, metLiveStand, postMessage, previewText, type ChatMessage, type ChatThread } from "@/lib/messaging/store";
import { POST as stuurBericht } from "@/app/api/inbox/[threadId]/route";
import { POST as werkBij } from "@/app/api/inbox/[threadId]/live-locatie/route";
import { ERASABLE_KV_PREFIXES } from "@/lib/privacy/user-kv";

const NU = new Date("2026-11-15T12:00:00+01:00");
const plekVan = (body: unknown) =>
  werkBij(new Request("http://localhost/api/inbox/t1/live-locatie", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ threadId: "t1" }) });
const lijst = () => kv.get("chat-messages:t1") as ChatMessage[];
const naSec = (s: number) => vi.setSystemTime(new Date(NU.getTime() + s * 1000));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
  kv.clear();
  kv.set("chat-thread:t1", { id: "t1", kind: "group", participants: ["a", "b"], createdAt: "", lastMessageAt: "", lastMessage: null, meta: {}, reads: {} } as ChatThread);
  wie = "a";
});
afterEach(() => {
  vi.useRealTimers();
});

describe("de regels (puur)", () => {
  it("alleen 15, 60 of 480 minuten; te snel bijwerken bewaart niets; voorbij is voorbij; doorsturen zonder live", () => {
    expect(startLive(15, NU)).toEqual({ tot: "2026-11-15T11:15:00.000Z", bijgewerkt: "2026-11-15T11:00:00.000Z" });
    expect(startLive(480, NU)?.tot).toBe("2026-11-15T19:00:00.000Z");
    expect(startLive(30, NU)).toBeNull();
    const plek = { lat: 52, lng: 5, live: startLive(15, NU)! };
    expect(werkLiveBij(plek, 53, 6, new Date(NU.getTime() + 2000))).toEqual({ plek, opgeslagen: false });
    const later = werkLiveBij(plek, 53, 6, new Date(NU.getTime() + MIN_TUSSEN_SEC * 1000));
    expect(later).toMatchObject({ opgeslagen: true, plek: { lat: 53, lng: 6, live: { bijgewerkt: "2026-11-15T11:00:10.000Z" } } });
    expect(werkLiveBij(plek, 53, 6, new Date(NU.getTime() + 16 * 60_000))).toEqual({ fout: "voorbij" });
    expect(werkLiveBij({ lat: 1, lng: 1 }, 2, 2, NU)).toEqual({ fout: "geen-live" });
    expect(stopLive(plek, NU).live?.gestopt).toBe("2026-11-15T11:00:00.000Z");
    expect(vastePlek({ ...plek, label: "Hier" })).toEqual({ lat: 52, lng: 5, label: "Hier" });
  });
});

describe("live locatie in een gesprek", () => {
  const deel = async () => (await postMessage("t1", "a", "", "location", { location: { lat: 52, lng: 5, live: startLive(15)! } })).id;

  it("versturen via de verzendroute: met live; een andere duur geeft 422; de voorvertoning zegt live", async () => {
    const stuur = (location: unknown) =>
      stuurBericht(new Request("http://localhost/api/inbox/t1", { method: "POST", body: JSON.stringify({ kind: "location", text: "", location }) }), { params: Promise.resolve({ threadId: "t1" }) });
    const goed = await stuur({ lat: 52, lng: 5, live: { minuten: 60 } });
    expect(goed.status).toBe(201);
    const m = (await goed.json()).message as ChatMessage;
    expect(m.location?.live).toEqual({ tot: "2026-11-15T12:00:00.000Z", bijgewerkt: "2026-11-15T11:00:00.000Z" });
    expect(previewText(m)).toBe("📡 Live locatie");
    expect((await stuur({ lat: 52, lng: 5, live: { minuten: 30 } })).status).toBe(422);
  });

  it("de afzender werkt bij in een eigen sleutel, niet in de berichtenlijst; de lijst krijgt de nieuwe plek bij het ophalen", async () => {
    const id = await deel();
    naSec(15);
    const res = await plekVan({ messageId: id, lat: 52.1, lng: 5.1 });
    expect(res.status).toBe(200);
    expect((await res.json()).location).toMatchObject({ lat: 52.1, lng: 5.1 });
    expect(lijst()[0]!.location).toMatchObject({ lat: 52, lng: 5 });
    expect(kv.get(`chat-live:a:t1:${id}`)).toEqual({ lat: 52.1, lng: 5.1, bijgewerkt: "2026-11-15T11:00:15.000Z" });
    expect((await metLiveStand(await getMessages("t1")))[0]!.location).toMatchObject({ lat: 52.1, lng: 5.1 });
    // te snel daarna: geen fout, maar ook niets bewaard
    naSec(18);
    expect((await (await plekVan({ messageId: id, lat: 60, lng: 6 })).json()).location).toMatchObject({ lat: 52.1 });
  });

  it("een ander kan niet bijwerken of stoppen (404, geen 403); onzin geeft 422", async () => {
    const id = await deel();
    wie = "b";
    naSec(15);
    expect((await plekVan({ messageId: id, lat: 1, lng: 1 })).status).toBe(404);
    expect((await plekVan({ messageId: id, stop: true })).status).toBe(404);
    wie = "a";
    expect((await plekVan({ messageId: id, lat: 100, lng: 1 })).status).toBe(422);
  });

  it("stoppen: de laatste plek in het bericht, de sleutel weg, daarna 410", async () => {
    const id = await deel();
    naSec(15);
    await plekVan({ messageId: id, lat: 52.2, lng: 5.2 });
    naSec(60);
    const res = await plekVan({ messageId: id, stop: true });
    expect(res.status).toBe(200);
    expect(lijst()[0]!.location).toMatchObject({ lat: 52.2, lng: 5.2, live: { gestopt: "2026-11-15T11:01:00.000Z" } });
    expect(kv.has(`chat-live:a:t1:${id}`)).toBe(false);
    naSec(90);
    const daarna = await plekVan({ messageId: id, lat: 1, lng: 1 });
    expect(daarna.status).toBe(410);
    expect((await daarna.json()).error.code).toBe("LIVE_VOORBIJ");
  });

  it("verlopen terwijl de afzender weg is: bij het ophalen gesloten met de laatste plek", async () => {
    const id = await deel();
    naSec(15);
    await plekVan({ messageId: id, lat: 52.3, lng: 5.3 });
    naSec(16 * 60);
    const [m] = await metLiveStand(await getMessages("t1"));
    expect(m!.location).toMatchObject({ lat: 52.3, lng: 5.3, live: { gestopt: "2026-11-15T11:15:00.000Z" } });
    expect(lijst()[0]!.location?.live?.gestopt).toBe("2026-11-15T11:15:00.000Z");
    expect(kv.has(`chat-live:a:t1:${id}`)).toBe(false);
  });

  it("intrekken haalt ook de plek die meeschoof weg", async () => {
    const id = await deel();
    naSec(15);
    await plekVan({ messageId: id, lat: 52.4, lng: 5.4 });
    await deleteMessage("t1", id);
    expect(kv.has(`chat-live:a:t1:${id}`)).toBe(false);
  });
});

describe("privacy en de chat", () => {
  it("de sleutel valt onder inzage en wissen; doorsturen geeft een vaste plek; de bubbel toont de kaart in Nederlandse tijd", () => {
    expect(ERASABLE_KV_PREFIXES).toContain("chat-live:");
    const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
    expect(lees("app/api/inbox/forward/route.ts")).toContain("extra.location = vastePlek(");
    expect(lees("components/chat/MessageBubble.tsx")).toContain('{m.kind === "location" && m.location?.live && (');
    const kaart = lees("components/chat/LiveLocatieKaart.tsx");
    expect(kaart).toContain('const TZ = "Europe/Amsterdam";');
    expect(kaart).toContain("timeZone: TZ");
    expect(lees("components/chat/Composer.tsx")).toContain("<LocatieKiezer onKies={shareLocation}");
  });
});
