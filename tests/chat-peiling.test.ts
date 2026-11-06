import { beforeEach, describe, expect, it, vi } from "vitest";

// De chat staat in KV; een geheugen-KV volstaat om stemmen te testen.
const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(v)]),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));

import { aantalStemmers, maakPeiling, mijnKeuze, sluitPeiling, stem, tikKeuze, uitslag, type MessagePoll } from "@/lib/messaging/poll";
import { getMessages, postMessage, previewText, updatePoll, type ChatThread } from "@/lib/messaging/store";

const peiling = (multi = false): MessagePoll => maakPeiling("Wie kan zaterdag?", ["Ik", "Ik niet", "Misschien"], multi)!.poll;

describe("maakPeiling", () => {
  it("ruimt lege en dubbele keuzes op (hoofdletters tellen niet) en nummert ze", () => {
    const p = maakPeiling("  Wie   kan zaterdag? ", ["Ja", " ", "ja", "Nee", ""], false);
    expect(p?.question).toBe("Wie kan zaterdag?");
    expect(p?.poll.options).toEqual([
      { id: "o1", text: "Ja" },
      { id: "o2", text: "Nee" },
    ]);
    expect(p?.poll.votes).toEqual({});
  });

  it("weigert zonder vraag of met minder dan twee verschillende keuzes", () => {
    expect(maakPeiling(" ", ["Ja", "Nee"], false)).toBeNull();
    expect(maakPeiling("Vraag", ["Ja", "JA"], false)).toBeNull();
  });

  it("houdt hooguit twaalf keuzes", () => {
    const p = maakPeiling("Welke dag?", Array.from({ length: 20 }, (_, i) => `Dag ${i + 1}`), true);
    expect(p?.poll.options).toHaveLength(12);
  });
});

describe("stemmen", () => {
  it("één keuze: een nieuwe stem vervangt de oude, leeg trekt hem in", () => {
    let p = stem(peiling(), "a", ["o1"]);
    p = stem(p, "a", ["o2", "o3"]);
    expect(mijnKeuze(p, "a")).toEqual(["o2"]);
    p = stem(p, "a", []);
    expect(mijnKeuze(p, "a")).toEqual([]);
    expect(p.votes).toEqual({});
  });

  it("meerkeuze: tikken zet een keuze aan en weer uit, onbekende ids vallen weg", () => {
    const p0 = peiling(true);
    let p = stem(p0, "a", tikKeuze(p0, "a", "o1"));
    p = stem(p, "a", tikKeuze(p, "a", "o3"));
    expect(mijnKeuze(p, "a")).toEqual(["o1", "o3"]);
    p = stem(p, "a", tikKeuze(p, "a", "o1"));
    expect(mijnKeuze(p, "a")).toEqual(["o3"]);
    expect(mijnKeuze(stem(p, "a", ["o9"]), "a")).toEqual([]);
  });

  it("telt mensen, niet stemmen, en wijst de (gedeelde) koploper aan", () => {
    let p = peiling(true);
    p = stem(p, "a", ["o1", "o2"]);
    p = stem(p, "b", ["o1"]);
    p = stem(p, "c", ["o2"]);
    expect(aantalStemmers(p)).toBe(3);
    const u = uitslag(p);
    expect(u.map((o) => [o.stemmen, o.procent, o.koploper])).toEqual([
      [2, 67, true],
      [2, 67, true],
      [0, 0, false],
    ]);
  });

  it("een gesloten peiling verandert niet meer", () => {
    const nu = new Date("2026-11-06T08:00:00.000Z");
    const p = sluitPeiling(stem(peiling(), "a", ["o1"]), nu);
    expect(p.closedAt).toBe(nu.toISOString());
    expect(stem(p, "b", ["o2"])).toBe(p);
    expect(sluitPeiling(p, new Date("2026-12-01T00:00:00.000Z")).closedAt).toBe(nu.toISOString());
  });
});

describe("updatePoll (store)", () => {
  beforeEach(() => {
    kv.clear();
    kv.set("chat-thread:t1", {
      id: "t1",
      kind: "group",
      participants: ["a", "b", "c"],
      createdAt: "2026-11-06T07:00:00.000Z",
      lastMessageAt: "2026-11-06T07:00:00.000Z",
      lastMessage: null,
      meta: {},
      reads: {},
    } as ChatThread);
  });

  it("bewaart stemmen van verschillende mensen en sluit daarna", async () => {
    const m = await postMessage("t1", "a", "Wie kan zaterdag?", "poll", { poll: peiling() });
    expect(previewText(m)).toBe("📊 Wie kan zaterdag?");
    await updatePoll("t1", m.id, { userId: "b", optionIds: ["o1"] });
    const na = await updatePoll("t1", m.id, { userId: "c", optionIds: ["o2"] });
    expect(na?.poll?.votes).toEqual({ o1: ["b"], o2: ["c"] });
    await updatePoll("t1", m.id, { sluit: true });
    expect(await updatePoll("t1", m.id, { userId: "a", optionIds: ["o3"] })).toBeNull();
    const [opgeslagen] = await getMessages("t1");
    expect(opgeslagen?.poll?.closedAt).toBeTruthy();
    expect(opgeslagen?.poll?.votes).toEqual({ o1: ["b"], o2: ["c"] });
  });

  it("doet niets met een gewoon bericht of een onbekend bericht", async () => {
    const m = await postMessage("t1", "a", "Hallo");
    expect(await updatePoll("t1", m.id, { userId: "b", optionIds: ["o1"] })).toBeNull();
    expect(await updatePoll("t1", "bestaat-niet", { sluit: true })).toBeNull();
  });

  it("een peiling-veld zonder soort 'poll' wordt niet bewaard", async () => {
    const m = await postMessage("t1", "a", "Hallo", "text", { poll: peiling() });
    expect(m.poll).toBeUndefined();
  });
});
