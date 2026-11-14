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

import { INHALEN_PER_RONDE, kiesInTeHalen, telKvkStand, vulKvkWachtAan } from "@/lib/kvk/inhalen";
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
    const uit = kiesInTeHalen(profielen, new Set(["d"]), new Map(), 1);
    expect(uit.kandidaten).toBe(3);
    expect(uit.nieuw).toEqual([{ userId: "a", kvkNumber: "12345678" }]);
    expect(kiesInTeHalen(profielen, new Set(["d"])).nieuw.map((p) => p.userId)).toEqual(["a", "e"]);
    // een opgegeven nummer (niet gevonden) komt niet terug; een ander nummer van dezelfde werker wel
    const op = new Map([["a", "12345678"], ["e", "99999999"]]);
    const met = kiesInTeHalen(profielen, new Set(), op);
    expect(met.nieuw.map((p) => p.userId)).toEqual(["e"]);
    expect(met.opgegeven).toBe(1);
    expect(INHALEN_PER_RONDE).toBe(50);
  });
});

describe("vulKvkWachtAan", () => {
  it("zet werkers zonder controle in de wacht, meteen aan de beurt, zonder poging te tellen", async () => {
    h.profielen = [{ userId: "u1", kvkNumber: "12345678" }, { userId: "u2", kvkNumber: "87654321" }];
    h.kv.set("kvk-wacht:werker:u2", { kvkNumber: "87654321", sinds: "2026-11-13T02:00:00.000Z", volgende: "2026-11-15T06:00:00.000Z", pogingen: 2, limiet: "tegoed" });
    const uit = await vulKvkWachtAan(NU);
    expect(uit).toEqual({ kandidaten: 2, ingehaald: 1, opgegeven: 0 });
    const w = h.kv.get("kvk-wacht:werker:u1") as KvkWacht;
    expect(w).toEqual({ kvkNumber: "12345678", sinds: NU.toISOString(), volgende: NU.toISOString(), pogingen: 0, limiet: "tegoed" });
    // de bestaande wacht blijft zoals hij was
    expect((h.kv.get("kvk-wacht:werker:u2") as KvkWacht).pogingen).toBe(2);
    // nog een ronde: niets nieuws
    expect((await vulKvkWachtAan(NU)).ingehaald).toBe(0);
  });

  it("een opgegeven nummer komt niet opnieuw in de wacht (en kost dus geen token meer)", async () => {
    h.profielen = [{ userId: "u1", kvkNumber: "12345678" }];
    h.kv.set("kvk-opgegeven:werker:u1", { kvkNumber: "12345678", op: "2026-11-14T08:30:00.000Z" });
    expect(await vulKvkWachtAan(NU)).toEqual({ kandidaten: 1, ingehaald: 0, opgegeven: 1 });
    expect(h.kv.has("kvk-wacht:werker:u1")).toBe(false);
    // de werker verbetert zijn nummer: dat telt wel weer
    h.profielen = [{ userId: "u1", kvkNumber: "12345679" }];
    expect((await vulKvkWachtAan(NU)).ingehaald).toBe(1);
  });

  it("faalt open: een databasestoring geeft 0 en gooit niet", async () => {
    h.kapot = true;
    expect(await vulKvkWachtAan(NU)).toEqual({ kandidaten: 0, ingehaald: 0, opgegeven: 0 });
    expect(await telKvkStand()).toEqual({ zonderControle: 0, opgegeven: 0 });
  });

  it("telt voor Te doen: zonder controle en opgegeven apart", async () => {
    h.profielen = [{ userId: "u1", kvkNumber: "12345678" }, { userId: "u2", kvkNumber: "87654321" }, { userId: "u3", kvkNumber: "11112222" }];
    h.kv.set("kvk-opgegeven:werker:u3", { kvkNumber: "11112222", op: "2026-11-14T08:30:00.000Z" });
    expect(await telKvkStand()).toEqual({ zonderControle: 2, opgegeven: 1 });
  });
});
