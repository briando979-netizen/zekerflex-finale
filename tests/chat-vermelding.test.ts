import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// WhatsApp-uitbouw stap 3 (13 nov): groepsberichten geven een melding, en in een groep kun je iemand @noemen. Wie
// genoemd wordt, krijgt ook een melding als hij de groep gedempt heeft (zoals WhatsApp).

const sendUserPush = vi.fn();
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: (...a: unknown[]) => sendUserPush(...a) }));
vi.mock("@/lib/messaging/presence", () => ({ visibleUsers: async () => new Set<string>() }));
vi.mock("@/lib/messaging/contacts", () => ({
  userDirectory: async (ids: string[]) => new Map(ids.map((id) => [id, { userId: id, name: id === "u_jan" ? "Jan de Vries" : id, role: "employer" }])),
  platformAdminIds: async () => [],
}));
// iedereen heeft deze groep gedempt
vi.mock("@/lib/messaging/thread-prefs", () => ({ getChatPrefs: async () => ({}), isMuted: () => true }));
vi.mock("@/lib/messaging/settings", () => ({ chatPrivacy: async () => ({ hideOnline: new Set(), noReceipts: new Set(), noPreview: new Set() }) }));

import { notifyNewMessage } from "@/lib/messaging/notify";
import type { ChatMessage, ChatThread } from "@/lib/messaging/store";
import { geldigeVermeldingen, kandidaten, vermeldingDelen, vermeldingenIn, vermeldingVraag, vulVermeldingIn, type Lid } from "@/lib/messaging/vermelding";

const jan: Lid = { userId: "u_jan", name: "Jan de Vries" };
const piet: Lid = { userId: "u_piet", name: "Piet Jansen" };
const anna: Lid = { userId: "u_anna", name: "Anna Bakker" };

afterEach(() => vi.clearAllMocks());

describe("@ typen", () => {
  it("herkent wat je na @ typt, alleen aan het begin of na een spatie", () => {
    expect(vermeldingVraag("Hoi @ja", 7)).toEqual({ start: 4, vraag: "ja" });
    expect(vermeldingVraag("@", 1)).toEqual({ start: 0, vraag: "" });
    expect(vermeldingVraag("mail@ja", 7)).toBeNull(); // een e-mailadres is geen vermelding
    expect(vermeldingVraag("Hoi @jan de", 11)).toBeNull(); // na een spatie is de lijst dicht
    expect(vermeldingVraag("Hoi @ja en meer", 7)).toEqual({ start: 4, vraag: "ja" }); // de cursor telt, niet het einde
  });

  it("zoekt eerst wie met de letters begint (voor- of achternaam), dan wie ze bevat", () => {
    expect(kandidaten([anna, piet, jan], "ja").map((l) => l.userId)).toEqual(["u_piet", "u_jan"]);
    expect(kandidaten([anna, piet, jan], "ak").map((l) => l.userId)).toEqual(["u_anna"]);
    expect(kandidaten([anna, piet, jan], "")).toHaveLength(3);
    expect(kandidaten([anna, piet, jan], "", 2)).toHaveLength(2);
  });

  it("zet de hele naam erin met een spatie erachter, en de cursor erachter", () => {
    expect(vulVermeldingIn("Hoi @ja", 4, 7, "Jan de Vries")).toEqual({ tekst: "Hoi @Jan de Vries ", cursor: 18 });
    expect(vulVermeldingIn("Hoi @ja kom je?", 4, 7, "Jan de Vries")).toEqual({ tekst: "Hoi @Jan de Vries kom je?", cursor: 18 });
  });

  it("stuurt alleen mee wie gekozen is en nog in de tekst staat", () => {
    expect(vermeldingenIn("Hoi @Jan de Vries", [jan, piet])).toEqual(["u_jan"]);
    expect(vermeldingenIn("Hoi allemaal", [jan])).toEqual([]);
  });
});

describe("de server en de bubbel", () => {
  it("houdt alleen leden van het gesprek over, niet jezelf, elk één keer", () => {
    expect(geldigeVermeldingen(["u_jan", "u_jan", "u_vreemd", "u_ik"], ["u_ik", "u_jan", "u_piet"], "u_ik")).toEqual(["u_jan"]);
    expect(geldigeVermeldingen(undefined, ["u_ik"], "u_ik")).toEqual([]);
  });

  it("deelt de tekst in stukken; de langste naam gaat voor", () => {
    expect(vermeldingDelen("Hoi @Jan de Vries en @Jan!", ["Jan", "Jan de Vries"])).toEqual([
      { tekst: "Hoi ", vermelding: false },
      { tekst: "@Jan de Vries", vermelding: true },
      { tekst: " en ", vermelding: false },
      { tekst: "@Jan", vermelding: true },
      { tekst: "!", vermelding: false },
    ]);
    expect(vermeldingDelen("geen namen", [])).toEqual([{ tekst: "geen namen", vermelding: false }]);
    expect(vermeldingDelen("@Piet is er niet", ["Jan"])).toEqual([{ tekst: "@Piet is er niet", vermelding: false }]);
  });
});

describe("meldingen in een groep", () => {
  const groep = (): ChatThread =>
    ({ id: "g1", kind: "group", participants: ["u_jan", "u_piet", "u_anna"], createdAt: "", lastMessageAt: "", lastMessage: null, meta: { title: "Team Zaterdag" }, reads: {} }) as ChatThread;
  const bericht = (over: Partial<ChatMessage> = {}): ChatMessage => ({ id: "m1", threadId: "g1", from: "u_jan", at: "2026-11-13T12:00:00+01:00", text: "Wie kan morgen?", kind: "text", ...over });

  it("gedempt: geen melding, behalve voor wie genoemd is", async () => {
    await notifyNewMessage(groep(), bericht());
    expect(sendUserPush).not.toHaveBeenCalled();
    await notifyNewMessage(groep(), bericht({ text: "@Piet Jansen kun jij morgen?", mentions: ["u_piet"] }));
    expect(sendUserPush).toHaveBeenCalledTimes(1);
    expect(sendUserPush.mock.calls[0]![0]).toEqual(["u_piet"]);
    expect(sendUserPush.mock.calls[0]![1]).toMatchObject({ title: "Team Zaterdag", body: "Jan de Vries: @Piet Jansen kun jij morgen?" });
  });
});

describe("waar het in de code zit", () => {
  const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

  it("de route bewaart alleen geldige vermeldingen, en alleen in een groep", () => {
    const route = lees("app/api/inbox/[threadId]/route.ts");
    expect(route).toContain("mentions: z.array(z.string().min(1).max(40)).max(VERMELDING_MAX).optional(),");
    expect(route).toMatch(/if \(thread\.kind === "group"\) \{\s*const genoemd = geldigeVermeldingen\(input\.mentions, thread\.participants, p\.userId\);/);
  });

  it("de invoer krijgt alleen in een groep een ledenlijst, en stuurt mentions mee", () => {
    expect(lees("components/chat/InboxPage.tsx")).toMatch(/members=\{\s*activeThread\.kind === "group"/);
    expect(lees("components/chat/Composer.tsx")).toContain("...(genoemd.length ? { mentions: genoemd } : {})");
  });
});
