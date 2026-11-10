import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/me/klus-route: de route van je eigen thuisbasis naar een klus. De
// thuisbasis komt uit je profiel (nooit uit het adres van het verzoek); zonder
// thuisbasis of routeplanner is het { route: null } en blijft de schatting staan.
const m = vi.hoisted(() => ({
  loggedIn: true,
  profiel: { homeLatitude: 52.3731, homeLongitude: 4.8936 } as { homeLatitude: number; homeLongitude: number } | null,
  klus: { branch: { latitude: 52.0907, longitude: 5.1214 } } as { branch: { latitude: number; longitude: number } } | null,
  route: { meters: 44_100, seconds: 2_460, lijn: [[4.8936, 52.3731], [5.1214, 52.0907]], stappen: [] } as unknown,
  vragen: [] as { van: unknown; naar: unknown; modus: string; opties: unknown }[],
}));

vi.mock("@/lib/auth", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    requirePrincipal: async () => {
      if (!m.loggedIn) throw AppError.unauthenticated();
      return { userId: "u1", grants: [{ role: "FREELANCER" }] };
    },
  };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: async () => m.profiel },
    shift: { findUnique: async () => m.klus },
  },
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/geo/route", () => ({
  planRoute: async (van: unknown, naar: unknown, modus: string, opties: unknown) => {
    m.vragen.push({ van, naar, modus, opties });
    return m.route;
  },
}));

const { GET } = await import("@/app/api/me/klus-route/route");

const vraag = (q: string) => GET(new Request(`http://app:3000/api/me/klus-route?${q}`));

beforeEach(() => {
  m.loggedIn = true;
  m.profiel = { homeLatitude: 52.3731, homeLongitude: 4.8936 };
  m.klus = { branch: { latitude: 52.0907, longitude: 5.1214 } };
  m.route = { meters: 44_100, seconds: 2_460, lijn: [[4.8936, 52.3731], [5.1214, 52.0907]], stappen: [] };
  m.vragen = [];
});

describe("GET /api/me/klus-route", () => {
  it("geeft de route van de eigen thuisbasis naar de klus, zonder afslagen en niet te bewaren", async () => {
    const res = await vraag("klus=k1&modus=fiets");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ route: { meters: 44_100, seconds: 2_460, lijn: [[4.8936, 52.3731], [5.1214, 52.0907]] } });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(m.vragen).toEqual([{ van: { lat: 52.3731, lon: 4.8936 }, naar: { lat: 52.0907, lon: 5.1214 }, modus: "fiets", opties: { stappen: false } }]);
  });

  it("zonder thuisbasis, of een thuisbasis buiten Nederland: route null, niets gevraagd", async () => {
    m.profiel = null;
    expect(await (await vraag("klus=k1")).json()).toEqual({ route: null });
    m.profiel = { homeLatitude: 0, homeLongitude: 0 };
    expect(await (await vraag("klus=k1")).json()).toEqual({ route: null });
    m.profiel = { homeLatitude: 52.3731, homeLongitude: 4.8936 };
    m.klus = null;
    expect(await (await vraag("klus=k1")).json()).toEqual({ route: null });
    expect(m.vragen).toHaveLength(0);
  });

  it("is de routeplanner er niet, dan route null (de pagina houdt de schatting)", async () => {
    m.route = null;
    expect(await (await vraag("klus=k1&modus=auto")).json()).toEqual({ route: null });
  });

  it("weigert een onbekende vervoerswijze of een lege klus met 422", async () => {
    expect((await vraag("klus=k1&modus=vliegen")).status).toBe(422);
    expect((await vraag("modus=auto")).status).toBe(422);
  });

  it("alleen ingelogd", async () => {
    m.loggedIn = false;
    expect((await vraag("klus=k1")).status).toBe(401);
  });
});
