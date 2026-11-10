import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/kaart/route: de vraag controleren, de route doorgeven, en als de
// routeplanner er niet is een 503 met een Nederlandse melding plus onze schatting.
const staat = vi.hoisted(() => ({
  uitkomst: { soort: "storing" } as { soort: "route"; route: unknown } | { soort: "geen" } | { soort: "storing" },
  gevraagd: 0,
}));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/http/request", () => ({ clientIp: () => "192.0.2.7" }));
vi.mock("@/lib/geo/route", () => ({
  routeStatus: async () => staat.uitkomst.soort !== "storing",
  vraagRoute: async () => {
    staat.gevraagd += 1;
    return staat.uitkomst;
  },
}));

import { GET, POST } from "@/app/api/kaart/route/route";

const DAM = { lat: 52.3731, lon: 4.8936 };
const DOM = { lat: 52.0907, lon: 5.1214 };

const post = (body: unknown) =>
  POST(new Request("http://app:3000/api/kaart/route", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  staat.uitkomst = { soort: "storing" };
  staat.gevraagd = 0;
});

describe("POST /api/kaart/route", () => {
  it("een kapotte vraag krijgt 422 met een Nederlandse uitleg, zonder de routeplanner te vragen", async () => {
    const res = await post("geen json");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ fout: "Kies een vertrekpunt en een bestemming." });
    const buiten = await post({ van: DAM, naar: { lat: 48.85, lon: 2.35 } });
    expect(buiten.status).toBe(422);
    expect(staat.gevraagd).toBe(0);
  });

  it("geeft de route door", async () => {
    const route = { meters: 44_100, seconds: 2_460, lijn: [[4.89, 52.37]], stappen: [] };
    staat.uitkomst = { soort: "route", route };
    const res = await post({ van: DAM, naar: DOM, modus: "fiets" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ route });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("geen weg tussen de punten: 200 met route null en een melding", async () => {
    staat.uitkomst = { soort: "geen" };
    const res = await post({ van: DAM, naar: DOM });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { route: unknown; fout: string };
    expect(body.route).toBeNull();
    expect(body.fout).toMatch(/geen route gevonden/);
  });

  it("is de routeplanner er niet, dan 503 met een melding en onze eigen schatting", async () => {
    const res = await post({ van: DAM, naar: DOM, modus: "auto" });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { fout: string; schatting: { meters: number; seconds: number } };
    expect(body.fout).toMatch(/even niet beschikbaar/);
    expect(body.schatting.meters).toBeGreaterThan(35_000);
    expect(body.schatting.seconds).toBeGreaterThan(0);
  });
});

describe("GET /api/kaart/route", () => {
  it("zegt of de routeplanner draait", async () => {
    expect(await (await GET()).json()).toEqual({ beschikbaar: false });
    staat.uitkomst = { soort: "geen" };
    expect(await (await GET()).json()).toEqual({ beschikbaar: true });
  });
});
