import { afterEach, describe, expect, it, vi } from "vitest";

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? kv.get(k) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvDelete: async (k: string) => void kv.delete(k),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));
vi.mock("@/lib/messaging/contacts", () => ({
  userDirectory: async (ids: string[]) => new Map(ids.map((id) => [id, { userId: id, name: id === "u_jan" ? "Jan de Vries" : "Bakkerij Bol" }])),
}));
const describeAppointment = vi.fn(async (_phrase: string, _ctx: string, fallback: string) => ({ title: fallback, location: null, byAi: false }));
vi.mock("@/lib/agenda/titles", () => ({ describeAppointment: (...a: [string, string, string]) => describeAppointment(...a) }));
vi.mock("@/lib/redis", () => ({ acquireLock: async () => async () => undefined }));

import { extractAppointments } from "@/lib/agenda/extract";
import { parseIcs } from "@/lib/agenda/ics";
import { cleanSubject, isBulkSender, stripQuotedReply } from "@/lib/agenda/mail-text";
import { deleteAgendaItem, listAgendaItems } from "@/lib/agenda/store";
import { scanChatMessage } from "@/lib/agenda/scan";
import { amsterdamToUtc } from "@/lib/time/amsterdam";
import type { ChatMessage, ChatThread } from "@/lib/messaging/store";

afterEach(() => {
  kv.clear();
  vi.clearAllMocks();
});

// Thursday 15 October 2026, 09:41 in Amsterdam (summer time until 25 October)
const REF = amsterdamToUtc(2026, 10, 15, 9, 41);

describe("extractAppointments", () => {
  const cases: [string, string | null, { end?: string; allDay?: boolean; confidence?: "high" | "medium" }?][] = [
    ["Kun je morgen om 8 uur beginnen?", "2026-10-16T06:00:00.000Z"],
    ["Afspraak dinsdag 14:30 bij jullie?", "2026-10-20T12:30:00.000Z"],
    ["Sollicitatiegesprek op 22 oktober om half 3", "2026-10-22T12:30:00.000Z"],
    ["Zullen we vrijdag 9-11 uur overleggen?", "2026-10-16T07:00:00.000Z", { end: "2026-10-16T09:00:00.000Z" }],
    ["Levering 20-10 tussen 10 en 12", "2026-10-20T08:00:00.000Z", { end: "2026-10-20T10:00:00.000Z" }],
    ["Tot vanavond 19.30!", "2026-10-15T17:30:00.000Z"],
    ["Kom je om 4?", "2026-10-15T14:00:00.000Z", { confidence: "medium" }],
    ["Bel me om 9", "2026-10-16T07:00:00.000Z", { confidence: "medium" }],
    ["Meeting next Monday at 10am", "2026-10-19T08:00:00.000Z"],
    ["Volgende week woensdag training", "2026-10-20T22:00:00.000Z", { allDay: true }],
    ["Kunnen we 3 november om 10:15 bellen?", "2026-11-03T09:15:00.000Z"],
    ["Op 2 januari om 9 uur starten we", "2027-01-02T08:00:00.000Z"],
    ["Interview on 15/11 at 2pm", "2026-11-15T13:00:00.000Z"],
    ["Donderdagmiddag 3 uur langskomen?", "2026-10-15T13:00:00.000Z"],
    ["Om 14:00 afspraak bij de tandarts", "2026-10-15T12:00:00.000Z", { confidence: "medium" }],
    ["Kwart voor 4 morgen bij de ingang", "2026-10-16T13:45:00.000Z"],
    ["Morgenochtend om 7 uur starten", "2026-10-16T05:00:00.000Z"],
    ["Gesprek 's avonds om 8", "2026-10-15T18:00:00.000Z", { confidence: "medium" }],
    ["Inwerken op 2026-10-19 van 9 tot 17 uur", "2026-10-19T07:00:00.000Z", { end: "2026-10-19T15:00:00.000Z" }],
    ["Ik kan morgen niet", null],
    ["Factuur van 1-10-2026", null],
    ["Mijn nummer is 06-12345678", null],
    ["Werktijden 8-12 uur", null],
    ["Prijs is 12.50 per uur", null],
    ["De dienst van maandag gaat niet door", null],
    ["Goedemorgen! Hoe gaat het?", null],
    ["Ik werk 's morgens het liefst", null],
  ];

  it.each(cases)("%s", (text, start, extra) => {
    const found = extractAppointments(text, REF);
    if (start === null) {
      expect(found).toEqual([]);
      return;
    }
    expect(found).toHaveLength(1);
    expect(found[0]!.start.toISOString()).toBe(start);
    expect(found[0]!.end?.toISOString() ?? undefined).toBe(extra?.end);
    expect(found[0]!.allDay).toBe(extra?.allDay ?? false);
    expect(found[0]!.confidence).toBe(extra?.confidence ?? (extra?.allDay ? "medium" : "high"));
  });

  it("ignores appointments that were already over when the message was written", () => {
    expect(extractAppointments("Vanochtend om 8 uur begonnen", REF)).toEqual([]);
  });
});

describe("invitations (.ics)", () => {
  it("reads Outlook (Windows zone name), IANA zones, UTC and all-day events; folded lines too", () => {
    const events = parseIcs(
      [
        "BEGIN:VCALENDAR",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        "UID:outlook-1",
        "SUMMARY:Kennismaking Bakkerij Bol en Zeker",
        " Flex",
        "LOCATION:Kerkstraat 1\\, Utrecht",
        "DTSTART;TZID=W. Europe Standard Time:20261020T143000",
        "DTEND;TZID=W. Europe Standard Time:20261020T153000",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:ny-1",
        "SUMMARY:Call met New York",
        "DTSTART;TZID=America/New_York:20261021T090000",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:utc-1",
        "DTSTART:20261022T080000Z",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:day-1",
        "SUMMARY:Open dag",
        "DTSTART;VALUE=DATE:20261101",
        "STATUS:CANCELLED",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    );
    expect(events[0]).toMatchObject({
      uid: "outlook-1",
      summary: "Kennismaking Bakkerij Bol en ZekerFlex",
      location: "Kerkstraat 1, Utrecht",
      allDay: false,
      cancelled: false,
    });
    expect(events[0]!.start.toISOString()).toBe("2026-10-20T12:30:00.000Z");
    expect(events[0]!.end!.toISOString()).toBe("2026-10-20T13:30:00.000Z");
    expect(events[1]!.start.toISOString()).toBe("2026-10-21T13:00:00.000Z");
    expect(events[2]!.start.toISOString()).toBe("2026-10-22T08:00:00.000Z");
    expect(events[3]).toMatchObject({ allDay: true, cancelled: true });
    expect(events[3]!.start.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("marks every event of a cancellation (METHOD:CANCEL) as cancelled", () => {
    const [ev] = parseIcs("BEGIN:VCALENDAR\nMETHOD:CANCEL\nBEGIN:VEVENT\nUID:x\nDTSTART:20261020T100000Z\nEND:VEVENT\nEND:VCALENDAR");
    expect(ev!.cancelled).toBe(true);
  });
});

describe("mail clean-up", () => {
  it("keeps only the new part of a reply (Gmail, Outlook, quoted lines)", () => {
    expect(stripQuotedReply("Prima, tot dan!\n\nOp do 15 okt 2026 om 09:12 schreef Jan <jan@x.nl>:\n> Morgen om 8 uur?")).toBe("Prima, tot dan!");
    expect(
      stripQuotedReply("Ja graag.\nVan: Jan de Vries\nVerzonden: donderdag 15 oktober 2026 09:12\nOnderwerp: Rooster\nMorgen om 8 uur?"),
    ).toBe("Ja graag.");
    expect(stripQuotedReply("Nieuw: dinsdag 14:00\n> oud: maandag 10:00")).toBe("Nieuw: dinsdag 14:00");
    expect(stripQuotedReply("Van 9 tot 17 uur werken we")).toBe("Van 9 tot 17 uur werken we");
  });

  it("recognises bulk senders and cleans subjects", () => {
    expect(isBulkSender("noreply@shop.nl", null)).toBe(true);
    expect(isBulkSender("nieuwsbrief@bedrijf.nl", "Nieuwsbrief")).toBe(true);
    expect(isBulkSender("jan@bakkerijbol.nl", "Jan de Vries")).toBe(false);
    expect(cleanSubject("Re: Fwd: Afspraak dinsdag")).toBe("Afspraak dinsdag");
    expect(cleanSubject("RE: ")).toBeNull();
  });
});

describe("chat → agenda", () => {
  const thread: ChatThread = {
    id: "t1",
    kind: "direct",
    participants: ["u_jan", "u_bol"],
    createdAt: "",
    lastMessageAt: "",
    lastMessage: null,
    meta: {},
    reads: {},
  };
  const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
    id: "m1",
    threadId: "t1",
    from: "u_jan",
    at: new Date().toISOString(),
    text: "Kun je overmorgen om 10:30 langskomen?",
    kind: "text",
    ...over,
  });

  it("plans it for both people, each titled with the other one's name", async () => {
    expect(await scanChatMessage(thread, msg())).toBe(2);
    const jan = await listAgendaItems("u_jan");
    const bol = await listAgendaItems("u_bol");
    expect(jan[0]).toMatchObject({ title: "Afspraak met Bakkerij Bol", source: "chat", sourceLabel: "Chat met Bakkerij Bol" });
    expect(bol[0]).toMatchObject({ title: "Afspraak met Jan de Vries" });
    expect(new Date(jan[0]!.end!).getTime() - new Date(jan[0]!.start).getTime()).toBe(60 * 60_000);
  });

  it("never duplicates, and a deleted appointment stays deleted", async () => {
    await scanChatMessage(thread, msg());
    expect(await scanChatMessage(thread, msg())).toBe(0);
    const [item] = await listAgendaItems("u_jan");
    await deleteAgendaItem("u_jan", item!.id);
    await scanChatMessage(thread, msg());
    expect(await listAgendaItems("u_jan")).toHaveLength(0);
  });

  it("skips groups, call logs and automatic replies", async () => {
    expect(await scanChatMessage({ ...thread, kind: "group" }, msg())).toBe(0);
    expect(await scanChatMessage(thread, msg({ kind: "call" }))).toBe(0);
    expect(await scanChatMessage(thread, msg({ auto: true }))).toBe(0);
    expect(describeAppointment).not.toHaveBeenCalled();
  });
});
