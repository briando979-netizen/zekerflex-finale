import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(v)]),
  kvListValues: async () => [],
}));

import { bewaardPerThread, geldigeBewaard, leesBewaard, MAX_BEWAARD, toggleBewaard, zetBewaard, type BewaardBericht } from "@/lib/messaging/bewaard";
import type { ChatMessage } from "@/lib/messaging/store";
import { ERASABLE_KV_PREFIXES } from "@/lib/privacy/user-kv";

const item = (threadId: string, messageId: string) => ({ threadId, messageId, excerpt: "Adres: Dorpsstraat 1", kind: "text" as const, from: "b", at: "2026-11-04T08:00:00.000Z" });
const msg = (id: string, text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, threadId: "t1", from: "b", at: "2026-11-04T08:00:00.000Z", text, kind: "text", ...extra });

beforeEach(() => kv.clear());

describe("bewaren met een ster", () => {
  it("aan zet bovenaan, nooit dubbel; uit haalt weg", () => {
    let l: BewaardBericht[] = [];
    l = toggleBewaard(l, item("t1", "m1"), true, new Date("2026-11-04T09:00:00Z"));
    l = toggleBewaard(l, item("t1", "m2"), true, new Date("2026-11-04T09:01:00Z"));
    l = toggleBewaard(l, item("t1", "m1"), true, new Date("2026-11-04T09:02:00Z"));
    expect(l.map((b) => b.messageId)).toEqual(["m1", "m2"]);
    l = toggleBewaard(l, item("t1", "m2"), false);
    expect(l.map((b) => b.messageId)).toEqual(["m1"]);
  });

  it("houdt hooguit MAX_BEWAARD berichten", () => {
    let l: BewaardBericht[] = [];
    for (let i = 0; i < MAX_BEWAARD + 5; i++) l = toggleBewaard(l, item("t1", `m${i}`), true);
    expect(l).toHaveLength(MAX_BEWAARD);
    expect(l[0]?.messageId).toBe(`m${MAX_BEWAARD + 4}`);
  });

  it("toont alleen wat nog bestaat, met de tekst van nu", () => {
    const l: BewaardBericht[] = [
      { ...item("t1", "bewerkt"), savedAt: "2026-11-04T09:03:00.000Z" },
      { ...item("t1", "weg"), savedAt: "2026-11-04T09:02:00.000Z" },
      { ...item("t1", "verwijderd"), savedAt: "2026-11-04T09:01:00.000Z" },
      { ...item("t2", "geen-toegang"), savedAt: "2026-11-04T09:00:00.000Z" },
    ];
    const berichten = new Map<string, Map<string, ChatMessage> | null>([
      ["t1", new Map([["bewerkt", msg("bewerkt", "Adres: Kerkstraat 9")], ["verwijderd", msg("verwijderd", "", { deleted: true })]])],
      ["t2", null],
    ]);
    const g = geldigeBewaard(l, berichten);
    expect(g.map((b) => b.messageId)).toEqual(["bewerkt"]);
    expect(g[0]?.excerpt).toBe("Adres: Kerkstraat 9");
  });

  it("geeft per gesprek de ids voor de ster bij de tijd", () => {
    const l = [toggleBewaard([], item("t1", "a"), true), toggleBewaard([], item("t2", "b"), true)].flat();
    expect(bewaardPerThread(l)).toEqual({ t1: ["a"], t2: ["b"] });
  });

  it("slaat per gebruiker op, onder een voorvoegsel dat mee gaat bij AVG-export en wissen", async () => {
    await zetBewaard("u1", item("t1", "m1"), true);
    expect(await leesBewaard("u1")).toHaveLength(1);
    expect(await leesBewaard("u2")).toHaveLength(0);
    expect(kv.has("chat-bewaard:u1")).toBe(true);
    expect(ERASABLE_KV_PREFIXES).toContain("chat-bewaard:");
  });
});
