import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodePolyline } from "@/lib/geo/polyline";

// lib/geo/route.ts praat met onze eigen Valhalla-server. Hier staat fetch nep:
// we kijken of een storing nooit een fout wordt, of de cache en de pauze na een
// storing werken, en of er geen coördinaten in het log komen.
const staat = vi.hoisted(() => ({
  url: "http://routes:8002" as string | undefined,
  waarschuwingen: [] as { msg: string; meta: unknown }[],
}));

vi.mock("@/lib/env", () => ({
  env: {
    get ROUTE_BASE_URL() {
      return staat.url;
    },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: (msg: string, meta: unknown) => staat.waarschuwingen.push({ msg, meta }),
  },
}));

import { planRoute, routeAan, routeStatus, vraagRoute } from "@/lib/geo/route";

const DAM = { lat: 52.3731, lon: 4.8936 };
const DOM = { lat: 52.0907, lon: 5.1214 };

const antwoord = (km: number, s: number) =>
  new Response(
    JSON.stringify({
      trip: {
        summary: { length: km, time: s },
        legs: [{ shape: encodePolyline([[DAM.lon, DAM.lat], [DOM.lon, DOM.lat]]), maneuvers: [{ instruction: "Rijd naar het zuiden.", length: km, time: s }] }],
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const fetchNep = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T09:00:00+01:00"));
  staat.url = "http://routes:8002";
  staat.waarschuwingen = [];
  delete (globalThis as { __zfRoute?: unknown }).__zfRoute;
  fetchNep.mockReset();
  vi.stubGlobal("fetch", fetchNep);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("routeplanner", () => {
  it("geeft een route met lijn en afslagen, en vraagt Valhalla om Nederlands", async () => {
    fetchNep.mockResolvedValueOnce(antwoord(44.1, 2460));
    const route = await planRoute(DAM, DOM, "auto");
    expect(route).toMatchObject({ meters: 44_100, seconds: 2460, stappen: [{ tekst: "Rijd naar het zuiden." }] });
    expect(route?.lijn).toHaveLength(2);
    const [url, init] = fetchNep.mock.calls[0] ?? [];
    expect(url).toBe("http://routes:8002/route");
    expect(JSON.parse(String(init?.body))).toMatchObject({ costing: "auto", language: "nl-NL", units: "kilometers" });
  });

  it("onthoudt een route: dezelfde vraag gaat niet nog eens naar de server", async () => {
    fetchNep.mockResolvedValueOnce(antwoord(44.1, 2460));
    await planRoute(DAM, DOM, "fiets");
    const tweede = await planRoute(DAM, DOM, "fiets");
    expect(tweede?.meters).toBe(44_100);
    expect(fetchNep).toHaveBeenCalledTimes(1);
  });

  it("geen weg (400) is null en geen storing", async () => {
    fetchNep.mockResolvedValueOnce(new Response(JSON.stringify({ error_code: 442, error: "No path could be found for input" }), { status: 400 }));
    expect(await vraagRoute(DAM, DOM, "lopen")).toEqual({ soort: "geen" });
    expect(routeAan()).toBe(true);
    expect(staat.waarschuwingen).toHaveLength(0);
  });

  it("is de server weg, dan null, één waarschuwing zonder coördinaten, en een minuut niet opnieuw proberen", async () => {
    fetchNep.mockRejectedValue(new TypeError("fetch failed"));
    expect(await planRoute(DAM, DOM, "auto")).toBeNull();
    expect(await planRoute(DOM, DAM, "auto")).toBeNull();
    expect(fetchNep).toHaveBeenCalledTimes(1);
    expect(routeAan()).toBe(false);
    expect(staat.waarschuwingen).toHaveLength(1);
    const log = JSON.stringify(staat.waarschuwingen);
    expect(log).toContain("routes:8002");
    expect(log).not.toMatch(/52\.37|4\.89|5\.12/);

    // na een minuut mag hij het weer proberen
    vi.setSystemTime(new Date("2026-11-10T09:01:01+01:00"));
    fetchNep.mockReset();
    fetchNep.mockResolvedValueOnce(antwoord(44.1, 2460));
    expect(routeAan()).toBe(true);
    expect(await planRoute(DOM, DAM, "auto")).not.toBeNull();
  });

  it("een foutcode of een onleesbaar antwoord is ook een storing, geen fout", async () => {
    fetchNep.mockResolvedValueOnce(new Response("kapot", { status: 502 }));
    expect(await vraagRoute(DAM, DOM, "auto")).toEqual({ soort: "storing" });
    delete (globalThis as { __zfRoute?: unknown }).__zfRoute;
    fetchNep.mockResolvedValueOnce(new Response(JSON.stringify({ iets: "anders" }), { status: 200 }));
    expect(await vraagRoute(DAM, DOM, "auto")).toEqual({ soort: "storing" });
  });

  it("zonder ROUTE_BASE_URL staat hij uit en vraagt hij niets", async () => {
    staat.url = undefined;
    expect(routeAan()).toBe(false);
    expect(await planRoute(DAM, DOM, "auto")).toBeNull();
    expect(await routeStatus()).toBe(false);
    expect(fetchNep).not.toHaveBeenCalled();
  });

  it("hoogstens vier vragen tegelijk; de rest wacht en komt daarna aan de beurt", async () => {
    let tegelijk = 0;
    let hoogste = 0;
    fetchNep.mockImplementation(async () => {
      tegelijk += 1;
      hoogste = Math.max(hoogste, tegelijk);
      await new Promise((r) => setTimeout(r, 5));
      tegelijk -= 1;
      return antwoord(10, 600);
    });
    const vragen = Array.from({ length: 10 }, (_, i) => planRoute({ lat: 52 + i / 100, lon: 5 }, DOM, "auto", { stappen: false }));
    const routes = await Promise.all(vragen);
    expect(routes.every((r) => r?.meters === 10_000)).toBe(true);
    expect(fetchNep).toHaveBeenCalledTimes(10);
    expect(hoogste).toBeLessThanOrEqual(4);
  });

  it("de status vraagt /status en onthoudt het antwoord een minuut", async () => {
    fetchNep.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    expect(await routeStatus()).toBe(true);
    expect(await routeStatus()).toBe(true);
    expect(fetchNep).toHaveBeenCalledTimes(1);
    expect(fetchNep.mock.calls[0]?.[0]).toBe("http://routes:8002/status");
  });
});
