import { beforeEach, describe, expect, it, vi } from "vitest";

// De keuze "zelf rekenen of Google vragen" zit in lib/geo/travel-time.ts. We
// zetten de sleutel, de gratis-knop en het antwoord van Google per test.
const staat = vi.hoisted(() => ({
  sleutel: "test-sleutel" as string | undefined,
  gratis: false,
  kapot: false,
  legs: new Map<string, { mode: string; durationSeconds: number; distanceMeters: number } | null>(),
  googleAanroepen: 0,
  tellers: new Map<string, number>(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    get GOOGLE_MAPS_API_KEY() {
      return staat.sleutel;
    },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/ai/gratis", () => ({
  gratisAan: () => staat.gratis,
  primeGratis: async () => {},
}));
vi.mock("@/lib/redis", () => ({
  // geen echte cache in de test: altijd doorrekenen
  cached: async <T>(_sleutel: string, _ttl: number, maak: () => Promise<T>) => maak(),
  redis: {
    incr: async (k: string) => {
      const n = (staat.tellers.get(k) ?? 0) + 1;
      staat.tellers.set(k, n);
      return n;
    },
    expire: async () => 1,
    get: async (k: string) => {
      const n = staat.tellers.get(k);
      return n === undefined ? null : String(n);
    },
  },
}));
vi.mock("@/lib/integrations/google-maps", () => ({
  fetchDistanceMatrix: async () => {
    staat.googleAanroepen += 1;
    if (staat.kapot) throw new Error("quotum vol");
    return staat.legs;
  },
}));

import { estimateTravel, getTravelRoutingStats } from "@/lib/geo/travel-time";

const THUIS = { latitude: 52.3731, longitude: 4.8922 }; // Dam, Amsterdam
const WERK = { latitude: 52.0907, longitude: 5.1214 }; // Domtoren, Utrecht
const AANKOMST = new Date("2026-11-10T08:00:00.000Z");

beforeEach(() => {
  staat.sleutel = "test-sleutel";
  staat.gratis = false;
  staat.kapot = false;
  staat.googleAanroepen = 0;
  staat.tellers.clear();
  staat.legs = new Map([
    ["DRIVING", { mode: "DRIVING", durationSeconds: 2_400, distanceMeters: 44_000 }],
  ]);
});

describe("reistijd: zelf rekenen of Google vragen", () => {
  it("met de knop 'alles gratis' aan vraagt hij niets bij Google", async () => {
    staat.gratis = true;
    const uit = await estimateTravel(THUIS, WERK, ["DRIVING"], AANKOMST);
    expect(staat.googleAanroepen).toBe(0);
    expect(uit[0]?.approximate).toBe(true);
    expect(uit[0]?.durationMinutes).toBeGreaterThan(0);
    expect(uit[0]?.distanceMeters).toBeGreaterThan(40_000);
    expect((await getTravelRoutingStats()).eigen).toBe(1);
  });

  it("zonder Google-sleutel rekent hij ook zelf", async () => {
    staat.sleutel = undefined;
    const uit = await estimateTravel(THUIS, WERK, ["DRIVING", "TRANSIT"], AANKOMST);
    expect(staat.googleAanroepen).toBe(0);
    expect(uit).toHaveLength(2);
    expect(uit.every((e) => e.approximate)).toBe(true);
  });

  it("met een sleutel en de knop uit gebruikt hij Google, en dat is geen schatting", async () => {
    const uit = await estimateTravel(THUIS, WERK, ["DRIVING"], AANKOMST);
    expect(staat.googleAanroepen).toBe(1);
    expect(uit[0]).toEqual({
      mode: "DRIVING",
      durationMinutes: 40,
      distanceMeters: 44_000,
      approximate: false,
    });
    const stats = await getTravelRoutingStats();
    expect(stats.live).toBe(1);
    expect(stats.fallbackRatePct).toBe(0);
  });

  it("valt Google weg, dan komt er alsnog onze eigen schatting terug", async () => {
    staat.kapot = true;
    const uit = await estimateTravel(THUIS, WERK, ["DRIVING", "TRANSIT"], AANKOMST);
    expect(uit).toHaveLength(2);
    expect(uit.every((e) => e.approximate)).toBe(true);
    expect(uit.every((e) => e.durationMinutes > 0 && e.distanceMeters > 0)).toBe(true);
    const stats = await getTravelRoutingStats();
    expect(stats.fallback).toBe(1);
    expect(stats.fallbackRatePct).toBe(100);
  });

  it("een vervoerswijze waar Google geen route voor geeft, rekenen we zelf uit", async () => {
    staat.legs.set("TRANSIT", null);
    const uit = await estimateTravel(THUIS, WERK, ["DRIVING", "TRANSIT"], AANKOMST);
    const auto = uit.find((e) => e.mode === "DRIVING");
    const ov = uit.find((e) => e.mode === "TRANSIT");
    expect(auto?.approximate).toBe(false);
    expect(ov?.approximate).toBe(true);
    expect(ov?.durationMinutes).toBeGreaterThan(0);
  });

  it("de tellers houden zelf rekenen en een storing bij Google apart", async () => {
    await estimateTravel(THUIS, WERK, ["DRIVING"], AANKOMST);
    staat.gratis = true;
    await estimateTravel(THUIS, WERK, ["DRIVING"], AANKOMST);
    staat.gratis = false;
    staat.kapot = true;
    await estimateTravel(THUIS, WERK, ["DRIVING"], AANKOMST);

    const stats = await getTravelRoutingStats();
    expect(stats).toEqual({ live: 1, fallback: 1, eigen: 1, fallbackRatePct: 50 });
  });
});
