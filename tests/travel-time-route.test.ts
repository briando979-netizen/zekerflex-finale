import { beforeEach, describe, expect, it, vi } from "vitest";

// De reistijd in de matching vraagt eerst onze eigen routeplanner (lib/geo/route.ts)
// en valt per vervoerswijze terug op de eigen schatting. Hier staan de routeplanner,
// de keuze en Google nep.
const staat = vi.hoisted(() => ({
  routeAan: true,
  routes: new Map<string, { meters: number; seconds: number } | null>(),
  gevraagd: [] as string[],
  keuze: "eigen" as "eigen" | "betaald",
  googleKapot: false,
}));

vi.mock("@/lib/env", () => ({ env: { GOOGLE_MAPS_API_KEY: "test-sleutel" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/ai/gratis", () => ({ gratisAan: () => false, primeGratis: async () => {} }));
vi.mock("@/lib/gratis/keuzes", () => ({
  primeKeuzes: async () => {},
  gebruikEigen: () => staat.keuze === "eigen",
}));
vi.mock("@/lib/redis", () => ({
  cached: async <T>(_k: string, _ttl: number, maak: () => Promise<T>) => maak(),
  redis: { incr: async () => 1, expire: async () => 1, get: async () => null },
}));
vi.mock("@/lib/integrations/google-maps", () => ({
  fetchDistanceMatrix: async () => {
    if (staat.googleKapot) throw new Error("quotum vol");
    return new Map();
  },
}));
vi.mock("@/lib/geo/route", () => ({
  routeAan: () => staat.routeAan,
  planRoute: async (_van: unknown, _naar: unknown, modus: string, opties: { stappen?: boolean }) => {
    staat.gevraagd.push(`${modus}:${opties.stappen === false ? "kort" : "lang"}`);
    const r = staat.routes.get(modus);
    return r ? { ...r, lijn: [], stappen: [] } : null;
  },
}));

import { estimateTravel } from "@/lib/geo/travel-time";

const THUIS = { latitude: 52.3731, longitude: 4.8922 };
const WERK = { latitude: 52.0907, longitude: 5.1214 };
const AANKOMST = new Date("2026-11-10T08:00:00+01:00");

beforeEach(() => {
  staat.routeAan = true;
  staat.routes = new Map([
    ["auto", { meters: 45_210, seconds: 2_520 }],
    ["fiets", { meters: 41_000, seconds: 9_000 }],
  ]);
  staat.gevraagd = [];
  staat.keuze = "eigen";
  staat.googleKapot = false;
});

describe("reistijd via onze eigen routeplanner", () => {
  it("een echte route is geen schatting, en de bron blijft 'eigen'", async () => {
    const [auto] = await estimateTravel(THUIS, WERK, ["DRIVING"], AANKOMST);
    expect(auto).toEqual({ mode: "DRIVING", durationMinutes: 42, distanceMeters: 45_210, approximate: false, bron: "eigen" });
    // zonder afslagen: de matching heeft alleen tijd en afstand nodig
    expect(staat.gevraagd).toEqual(["auto:kort"]);
  });

  it("het OV vraagt hij niet aan de routeplanner; een wijze zonder route blijft een schatting", async () => {
    const uit = await estimateTravel(THUIS, WERK, ["DRIVING", "TRANSIT", "WALKING"], AANKOMST);
    const per = new Map(uit.map((e) => [e.mode, e]));
    expect(per.get("DRIVING")?.approximate).toBe(false);
    expect(per.get("TRANSIT")).toMatchObject({ approximate: true, bron: "eigen" });
    expect(per.get("WALKING")).toMatchObject({ approximate: true, bron: "eigen" });
    expect(staat.gevraagd.sort()).toEqual(["auto:kort", "lopen:kort"]);
  });

  it("staat de routeplanner uit, dan de schatting zoals altijd, zonder iets te vragen", async () => {
    staat.routeAan = false;
    const [auto] = await estimateTravel(THUIS, WERK, ["DRIVING"], AANKOMST);
    expect(auto).toMatchObject({ approximate: true, bron: "eigen" });
    expect(auto?.durationMinutes).toBeGreaterThan(0);
    expect(staat.gevraagd).toEqual([]);
  });

  it("valt Google weg, dan eerst onze routeplanner en pas daarna de schatting", async () => {
    staat.keuze = "betaald";
    staat.googleKapot = true;
    const uit = await estimateTravel(THUIS, WERK, ["DRIVING", "TRANSIT"], AANKOMST);
    const per = new Map(uit.map((e) => [e.mode, e]));
    expect(per.get("DRIVING")).toMatchObject({ approximate: false, distanceMeters: 45_210 });
    expect(per.get("TRANSIT")).toMatchObject({ approximate: true, bron: "terugval" });
  });
});
