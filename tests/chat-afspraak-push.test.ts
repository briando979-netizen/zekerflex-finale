import { beforeEach, describe, expect, it, vi } from "vitest";

// Een afgezegde afspraak (14 nov): de systeemregel in het gesprek geeft geen push (AGENTS.md), dus meldt
// notifyAfspraakAfgezegd het zelf. Aan wie "ik kom" of "misschien" zei (ook als het gesprek gedempt is) en in een direct
// gesprek aan de ander als die niet dempte; niet aan wie "nee" zei of het gesprek open heeft. In de taal van de werker.

const { verstuurd, inBeeld, gedempt } = vi.hoisted(() => ({
  verstuurd: [] as { ids: string[]; nl: { title: string; body: string; data?: unknown }; en: { title: string; body: string } }[],
  inBeeld: new Set<string>(),
  gedempt: new Set<string>(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined, kvDelete: async () => undefined, kvListValues: async () => [] }));
vi.mock("@/lib/redis", () => ({ claimIdempotency: async () => true }));
vi.mock("@/lib/messaging/contacts", () => ({ platformAdminIds: async () => [], userDirectory: async () => new Map() }));
vi.mock("@/lib/messaging/settings", () => ({ chatPrivacy: async () => ({ hideOnline: new Set(), noReceipts: new Set(), noPreview: new Set() }) }));
vi.mock("@/lib/messaging/presence", () => ({ visibleUsers: async (ids: string[]) => new Set(ids.filter((id) => inBeeld.has(id))) }));
vi.mock("@/lib/messaging/thread-prefs", () => ({ getChatPrefs: async (id: string) => ({ id }), isMuted: (p: { id: string }) => gedempt.has(p.id) }));
vi.mock("@/lib/notifications/localized-push", async () => {
  const { WORKER_PUSH } = await import("@/lib/i18n/worker-push");
  return {
    sendMixedPush: async (ids: string[], build: (t: unknown, l: string) => { title: string; body: string; data?: unknown }) => {
      verstuurd.push({ ids, nl: build(WORKER_PUSH.nl, "nl"), en: build(WORKER_PUSH.en, "en") });
      return ids.length;
    },
  };
});

import { notifyAfspraakAfgezegd } from "@/lib/messaging/notify";
import type { ChatMessage, ChatThread } from "@/lib/messaging/store";

const draad = (kind: ChatThread["kind"], participants: string[]): ChatThread =>
  ({ id: "t1", kind, participants, createdAt: "", lastMessageAt: "", lastMessage: null, meta: {}, reads: {} }) as ChatThread;
const afspraak = (antwoorden: Record<string, "ja" | "misschien" | "nee">): ChatMessage =>
  ({
    id: "m1",
    threadId: "t1",
    from: "a",
    text: "Teamuitje",
    kind: "afspraak",
    at: "",
    // vrijdag 20 november 18:00–19:00 Nederlandse tijd
    afspraak: { start: "2026-11-20T17:00:00.000Z", eind: "2026-11-20T18:00:00.000Z", antwoorden, geannuleerd: "2026-11-14T12:00:00.000Z" },
  }) as ChatMessage;

beforeEach(() => {
  verstuurd.length = 0;
  inBeeld.clear();
  gedempt.clear();
});

describe("notifyAfspraakAfgezegd", () => {
  it("groep: wie ja of misschien zei, ook gedempt; niet nee, niet zonder antwoord, niet wie meekijkt", async () => {
    gedempt.add("c");
    inBeeld.add("f");
    await notifyAfspraakAfgezegd(draad("group", ["a", "b", "c", "d", "e", "f"]), afspraak({ a: "ja", b: "ja", c: "misschien", d: "nee", f: "ja" }), "Anna");
    expect(verstuurd).toHaveLength(1);
    expect(verstuurd[0]!.ids).toEqual(["b", "c"]);
    expect(verstuurd[0]!.nl).toMatchObject({
      title: "📅 Afgezegd: Teamuitje",
      body: "Anna heeft de afspraak van vr 20 nov 18:00–19:00 afgezegd.",
      data: { type: "CHAT", tag: "afspraak-m1", url: "/berichten?thread=t1" },
    });
    expect(verstuurd[0]!.en.title).toBe("📅 Cancelled: Teamuitje");
  });

  it("direct: de ander, ook zonder antwoord, behalve als die het gesprek dempte en niet ja zei", async () => {
    await notifyAfspraakAfgezegd(draad("direct", ["a", "b"]), afspraak({}), "Anna");
    expect(verstuurd[0]?.ids).toEqual(["b"]);
    gedempt.add("b");
    await notifyAfspraakAfgezegd(draad("direct", ["a", "b"]), afspraak({}), "Anna");
    expect(verstuurd).toHaveLength(1);
    await notifyAfspraakAfgezegd(draad("direct", ["a", "b"]), afspraak({ b: "ja" }), "Anna");
    expect(verstuurd[1]?.ids).toEqual(["b"]);
  });

  it("geen afspraak of niemand om te melden: geen push", async () => {
    await notifyAfspraakAfgezegd(draad("group", ["a", "b"]), { ...afspraak({}), kind: "text" } as ChatMessage, "Anna");
    await notifyAfspraakAfgezegd(draad("group", ["a", "b"]), afspraak({ b: "nee" }), "Anna");
    expect(verstuurd).toHaveLength(0);
  });
});
