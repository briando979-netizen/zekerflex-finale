import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// KVK-controles inhalen (lib/kvk/inhalen.ts): werkers met een nummer zonder geslaagde controle komen vanzelf in de
// wacht van de herkansing, zonder dat er bij KVKBase wordt aangeklopt; alles faalt open.

const h = vi.hoisted(() => ({
  profielen: [] as { userId: string; kvkNumber: string | null }[],
  kapot: false,
  kv: new Map<string, unknown>(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: {
      findMany: async () => {
        if (h.kapot) throw new Error("db weg");
        return h.profielen;
      },
      count: async () => {
        if (h.kapot) throw new Error("db weg");
        return h.profielen.length;
      },
    },
  },
}));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
  kvDelete: async (k: string) => void h.kv.delete(k),
  kvListEntries: async (prefix: string) => [...h.kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value })),
}));

import { INHALEN_PER_RONDE, kiesInTeHalen, telWerkersZonderKvkControle, vulKvkWachtAan } from "@/lib/kvk/inhalen";
import type { KvkWacht } from "@/lib/kvk/tegoed-opslag";

const NU = new Date("2026-11-14T09:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
  h.profielen = [];
  h.kapot = false;
  h.kv.clear();
});
afterEach(() => vi.useRealTimers());

describe("kiesInTeHalen (puur)", () => {
  it("alleen een geldig nummer, nog niet wachtend, hooguit het maximum", () => {
    const profielen = [
      { userId: "a", kvkNumber: "12345678" },
      { userId: "b", kvkNumber: "1234567" }, // te kort
      { userId: "c", kvkNumber: null },
      { userId: "d", kvkNumber: "87654321" }, // staat al in de wacht
      { userId: "e", kvkNumber: "11112222" },
    ];
    const uit = kiesInTeHalen(profielen, new Set(["d"]), 1);
    expect(uit.kandidaten).toBe(3);
    expect(uit.nieuw).toEqual([{ userId: "a", kvkNumber: "12345678" }]);
    expect(kiesInTeHalen(profielen, new Set(["d"])).nieuw.map((p) => p.userId)).toEqual(["a", "e"]);
    expect(INHALEN_PER_RONDE).toBe(50);
  });
});

describe("vulKvkWachtAan", () => {
  it("zet werkers zonder controle in de wacht, meteen aan de beurt, zonder poging te tellen", async () => {
    h.profielen = [{ userId: "u1", kvkNumber: "12345678" }, { userId: "u2", kvkNumber: "87654321" }];
    h.kv.set("kvk-wacht:werker:u2", { kvkNumber: "87654321", sinds: "2026-11-13T02:00:00.000Z", volgende: "2026-11-15T06:00:00.000Z", pogingen: 2, limiet: "tegoed" });
    const uit = await vulKvkWachtAan(NU);
    expect(uit).toEqual({ kandidaten: 2, ingehaald: 1 });
    const w = h.kv.get("kvk-wacht:werker:u1") as KvkWacht;
    expect(w).toEqual({ kvkNumber: "12345678", sinds: NU.toISOString(), volgende: NU.toISOString(), pogingen: 0, limiet: "tegoed" });
    // de bestaande wacht blijft zoals hij was
    expect((h.kv.get("kvk-wacht:werker:u2") as KvkWacht).pogingen).toBe(2);
    // nog een ronde: niets nieuws
    expect((await vulKvkWachtAan(NU)).ingehaald).toBe(0);
  });

  it("faalt open: een databasestoring geeft 0 en gooit niet", async () => {
    h.kapot = true;
    expect(await vulKvkWachtAan(NU)).toEqual({ kandidaten: 0, ingehaald: 0 });
    expect(await telWerkersZonderKvkControle()).toBe(0);
  });

  it("telt de werkers zonder controle voor Te doen", async () => {
    h.profielen = [{ userId: "u1", kvkNumber: "12345678" }, { userId: "u2", kvkNumber: "87654321" }];
    expect(await telWerkersZonderKvkControle()).toBe(2);
  });
});
