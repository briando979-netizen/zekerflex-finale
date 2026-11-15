import { afterEach, describe, expect, it, vi } from "vitest";
import { inNederland, tegelPositie, tegelsRond, TEGEL } from "@/lib/kaart/voorbeeld";
import { GET } from "@/app/api/kaart/straat/[z]/[x]/[y]/route";

// Het kaartje bij een gedeelde locatie in de chat: de tegelrekenkunde en de route die de tegels van PDOK doorgeeft.

describe("tegelrekenkunde", () => {
  it("klopt op bekende punten van web-mercator", () => {
    expect(tegelPositie(0, 0, 0)).toEqual({ x: 0.5, y: 0.5 });
    const p = tegelPositie(0, 0, 1);
    expect(p.x).toBeCloseTo(1, 10);
    expect(p.y).toBeCloseTo(1, 10);
    const a = tegelPositie(0, -180, 3);
    expect(a.x).toBeCloseTo(0, 10);
  });

  it("de plek ligt precies in het midden van de negen tegels", () => {
    const lat = 53.1011;
    const lng = 6.8745;
    const z = 16;
    const p = tegelPositie(lat, lng, z);
    const tegels = tegelsRond(lat, lng, z);
    expect(tegels).toHaveLength(9);
    // de middelste tegel begint links van het midden en eindigt rechts ervan: de plek zit erin
    const midden = tegels.find((t) => t.x === Math.floor(p.x) && t.y === Math.floor(p.y))!;
    expect(midden.links).toBeLessThanOrEqual(0);
    expect(midden.links + TEGEL).toBeGreaterThanOrEqual(0);
    expect(midden.boven).toBeLessThanOrEqual(0);
    expect(midden.boven + TEGEL).toBeGreaterThanOrEqual(0);
    // een kaartje van 320 bij 128 beeldpunten wordt helemaal gedekt
    const minLinks = Math.min(...tegels.map((t) => t.links));
    const maxRechts = Math.max(...tegels.map((t) => t.links + TEGEL));
    const minBoven = Math.min(...tegels.map((t) => t.boven));
    const maxOnder = Math.max(...tegels.map((t) => t.boven + TEGEL));
    expect(minLinks).toBeLessThanOrEqual(-160);
    expect(maxRechts).toBeGreaterThanOrEqual(160);
    expect(minBoven).toBeLessThanOrEqual(-64);
    expect(maxOnder).toBeGreaterThanOrEqual(64);
  });

  it("de rand van de wereld geeft geen tegels buiten het raster", () => {
    expect(tegelsRond(0, -179.9999, 2).every((t) => t.x >= 0 && t.y >= 0 && t.x < 4 && t.y < 4)).toBe(true);
  });
});

describe("inNederland", () => {
  it("Groningen en Maastricht ja, Dakar en een rommelwaarde nee", () => {
    expect(inNederland(53.1011, 6.8745)).toBe(true);
    expect(inNederland(50.85, 5.69)).toBe(true);
    expect(inNederland(14.7, -17.4)).toBe(false);
    expect(inNederland(Number.NaN, 5)).toBe(false);
    expect(inNederland(52, Infinity)).toBe(false);
  });
});

describe("route /api/kaart/straat", () => {
  afterEach(() => vi.unstubAllGlobals());
  const vraag = (z: string, x: string, y: string) => GET(new Request("http://x"), { params: Promise.resolve({ z, x, y }) });

  it("weigert rare waarden en tegels buiten Nederland zonder PDOK te vragen", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await vraag("16", "abc", "1")).status).toBe(404);
    expect((await vraag("5", "1", "1")).status).toBe(404); // te ver uitgezoomd
    expect((await vraag("20", "1", "1")).status).toBe(404); // te dichtbij
    expect((await vraag("16", "-1", "1")).status).toBe(404);
    expect((await vraag("16", "70000", "1")).status).toBe(404);
    // Dakar op zoom 16
    const p = tegelPositie(14.7, -17.4, 16);
    expect((await vraag("16", String(Math.floor(p.x)), String(Math.floor(p.y)))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("geeft een tegel in Nederland door als png met cache, en meldt een storing van PDOK als 502", async () => {
    const p = tegelPositie(53.1011, 6.8745, 16);
    const x = String(Math.floor(p.x));
    const y = String(Math.floor(p.y));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 })));
    const ok = await vraag("16", x, y);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(ok.headers.get("cache-control")).toContain("max-age");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("kapot", { status: 500 })));
    expect((await vraag("16", x, y)).status).toBe(502);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("netwerk"); }));
    expect((await vraag("16", x, y)).status).toBe(502);
  });
});
