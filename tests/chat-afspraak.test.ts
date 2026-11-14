import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// WhatsApp-uitbouw stap 13 (14 nov): een afspraak met aanmelden in de chat, zoals een evenement in WhatsApp. Ingevuld in
// Nederlandse tijd, bewaard in UTC, .ics met Z; antwoorden "ja/misschien/nee" met namen; alleen de maker zegt af.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(v)]),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));
let wie = "a";
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: wie, fullName: wie === "a" ? "Anna" : "Bas" }) }));
vi.mock("@/lib/messaging/contacts", () => ({ isPlatformAdmin: async () => false }));
const { afgezegdPush } = vi.hoisted(() => ({ afgezegdPush: vi.fn() }));
vi.mock("@/lib/messaging/notify", () => ({ notifyAfspraakAfgezegd: (...a: unknown[]) => afgezegdPush(...a) }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void fn() }));

import { alsIcs, annuleerAfspraak, maakAfspraak, perAntwoord, zetAntwoord } from "@/lib/messaging/afspraak";
import { getMessages, postMessage, previewText, type ChatThread } from "@/lib/messaging/store";
import { POST } from "@/app/api/inbox/[threadId]/afspraak/route";

const NU = new Date("2026-11-14T12:00:00+01:00");
const antwoord = (body: unknown) =>
  POST(new Request("http://localhost/api/inbox/t1/afspraak", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ threadId: "t1" }) });

beforeEach(() => {
  kv.clear();
  kv.set("chat-thread:t1", { id: "t1", kind: "group", participants: ["a", "b"], createdAt: "", lastMessageAt: "", lastMessage: null, meta: {}, reads: {} } as ChatThread);
  wie = "a";
  afgezegdPush.mockClear();
});

describe("maakAfspraak", () => {
  it("Nederlandse tijd in, UTC uit; duur binnen 15 min en 24 uur; plek opgeschoond", () => {
    const a = maakAfspraak("  Kennismaking  ", "2026-11-15T14:00", 90, "  Stationsplein 1  ", NU);
    expect(a).toEqual({ titel: "Kennismaking", afspraak: { start: "2026-11-15T13:00:00.000Z", eind: "2026-11-15T14:30:00.000Z", plek: "Stationsplein 1", antwoorden: {} } });
    // zomertijd: +02:00
    expect(maakAfspraak("Zomer", "2027-06-01T09:00", 60, undefined, NU)?.afspraak.start).toBe("2027-06-01T07:00:00.000Z");
    expect(maakAfspraak("Kort", "2026-11-15T14:00", 1, "", NU)?.afspraak.eind).toBe("2026-11-15T13:15:00.000Z");
  });

  it("geen titel, een onleesbare tijd, te lang geleden of te ver vooruit: null", () => {
    expect(maakAfspraak("  ", "2026-11-15T14:00", 60, undefined, NU)).toBeNull();
    expect(maakAfspraak("x", "morgen om 2", 60, undefined, NU)).toBeNull();
    expect(maakAfspraak("x", "2026-11-12T14:00", 60, undefined, NU)).toBeNull();
    expect(maakAfspraak("x", "2028-01-01T14:00", 60, undefined, NU)).toBeNull();
  });

  it("antwoorden, intrekken, per antwoord; afgezegd verandert niet meer; .ics in UTC met Z", () => {
    const a = maakAfspraak("Vergadering; team, zaterdag", "2026-11-15T14:00", 60, "Hal 3", NU)!.afspraak;
    let b = zetAntwoord(a, "a", "ja");
    b = zetAntwoord(b, "b", "nee");
    b = zetAntwoord(b, "b", null);
    expect(perAntwoord(b)).toEqual({ ja: ["a"], misschien: [], nee: [] });
    const af = annuleerAfspraak(b, NU);
    expect(zetAntwoord(af, "b", "ja")).toBe(af);
    const ics = alsIcs("Vergadering; team, zaterdag", af, "m1", NU);
    expect(ics).toContain("DTSTART:20261115T130000Z\r\n");
    expect(ics).toContain("DTEND:20261115T140000Z\r\n");
    expect(ics).toContain("SUMMARY:Vergadering\\; team\\, zaterdag\r\n");
    expect(ics).toContain("STATUS:CANCELLED\r\n");
  });
});

describe("de afspraak-route", () => {
  const maak = async () => {
    const a = maakAfspraak("Teamuitje", "2026-11-20T18:00", 120, "Utrecht", NU)!;
    return postMessage("t1", "a", a.titel, "afspraak", { afspraak: a.afspraak });
  };

  it("antwoorden geeft de serverversie terug; de voorvertoning noemt de titel", async () => {
    const m = await maak();
    expect(previewText(m)).toBe("📅 Teamuitje");
    wie = "b";
    const res = await antwoord({ messageId: m.id, antwoord: "misschien" });
    expect(res.status).toBe(200);
    expect((await res.json()).afspraak.antwoorden).toEqual({ b: "misschien" });
  });

  it("alleen de maker zegt af; daarna een regel in het gesprek en geen antwoorden meer", async () => {
    const m = await maak();
    wie = "b";
    expect((await antwoord({ messageId: m.id, annuleer: true })).status).toBe(403);
    wie = "a";
    expect((await antwoord({ messageId: m.id, annuleer: true })).status).toBe(200);
    expect((await getMessages("t1")).some((x) => x.kind === "system" && x.text === 'Anna heeft de afspraak "Teamuitje" afgezegd.')).toBe(true);
    // de systeemregel geeft geen push: de route meldt het zelf, één keer (nog eens afzeggen meldt niets)
    expect(afgezegdPush).toHaveBeenCalledTimes(1);
    expect(afgezegdPush.mock.calls[0]?.[1]).toMatchObject({ id: m.id, afspraak: { geannuleerd: expect.any(String) } });
    expect(afgezegdPush.mock.calls[0]?.[2]).toBe("Anna");
    expect((await antwoord({ messageId: m.id, annuleer: true })).status).toBe(200);
    expect(afgezegdPush).toHaveBeenCalledTimes(1);
    wie = "b";
    expect((await antwoord({ messageId: m.id, antwoord: "ja" })).status).toBe(422);
  });

  it("geen afspraak of een onzin-antwoord: 404 of 422", async () => {
    const tekst = await postMessage("t1", "a", "gewoon tekst");
    expect((await antwoord({ messageId: tekst.id, antwoord: "ja" })).status).toBe(404);
    const m = await maak();
    expect((await antwoord({ messageId: m.id, antwoord: "graag" })).status).toBe(422);
  });
});

describe("in de chat", () => {
  it("het menu heeft Afspraak; de bubbel toont de kaart; tijden met de Nederlandse tijdzone", () => {
    const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
    expect(lees("components/chat/Composer.tsx")).toContain("label={chat.composer.menuAfspraak}");
    expect(lees("components/chat/MessageBubble.tsx")).toContain('{m.kind === "afspraak" && m.afspraak && (');
    const kaart = lees("components/chat/AfspraakCard.tsx");
    expect(kaart).toContain('const TZ = "Europe/Amsterdam";');
    expect(kaart.match(/timeZone: TZ/g)?.length).toBe(3);
  });
});
