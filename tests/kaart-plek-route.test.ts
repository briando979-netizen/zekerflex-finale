import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ plek: vi.fn(), limiet: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: m.limiet }));
vi.mock("@/lib/http/request", () => ({ clientIp: () => "203.0.113.9" }));
vi.mock("@/lib/integrations/osm-plaatsen", async () => {
  const echt = await vi.importActual<typeof import("@/lib/integrations/osm-plaatsen")>("@/lib/integrations/osm-plaatsen");
  return { ...echt, osmPlekBijPunt: m.plek };
});
vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/ai/gratis", () => ({ gratisAan: () => false, primeGratis: async () => undefined }));
vi.mock("@/lib/env", () => ({ env: { GOOGLE_MAPS_API_KEY: undefined } }));

import { GET } from "@/app/api/kaart/plek/route";

const vraag = (qs: string) => GET(new Request(`http://app:3000/api/kaart/plek?${qs}`));

beforeEach(() => {
  m.plek.mockReset();
  m.limiet.mockReset().mockResolvedValue(undefined);
});

describe("GET /api/kaart/plek", () => {
  it("geeft openingstijden als leesbare regels, plus telefoon, website en de OSM-link", async () => {
    m.plek.mockResolvedValueOnce({
      id: "osmplaats-node-000000000011",
      naam: "Bakkerij Jansen",
      adres: "Oudegracht 1, 3511 AA Utrecht",
      plaats: "Utrecht",
      locatie: { lat: 52.09, lng: 5.12 },
      website: "https://bakkerijjansen.nl",
      telefoon: "+31301234567",
      soort: "bakery",
      soortSleutel: "shop",
      openingstijden: "Mo-Fr 08:00-17:00; Su off",
      kaartUrl: "https://www.openstreetmap.org/node/11",
    });
    const res = await vraag("lat=52.0907&lng=5.1214&naam=Bakkerij%20Jansen");
    expect(res.status).toBe(200);
    const { plek } = (await res.json()) as { plek: { uren: string[]; telefoon: string; kaartUrl: string } };
    expect(plek.telefoon).toBe("+31301234567");
    expect(plek.uren).toContain("maandag: 08:00 – 17:00");
    expect(plek.uren).toContain("zondag: Gesloten");
    expect(plek.kaartUrl).toBe("https://www.openstreetmap.org/node/11");
    expect(res.headers.get("cache-control")).toMatch(/max-age=3600/);
  });

  it("vraagt niets op buiten Nederland, bij onzinwaarden of een te korte naam", async () => {
    for (const qs of ["lat=40.4&lng=-3.7&naam=Cafe%20Madrid", "lat=abc&lng=5&naam=Bakker", "lat=52&lng=5&naam=", "lat=52&lng=5&naam=X", "naam=Bakker"]) {
      const res = await vraag(qs);
      expect(((await res.json()) as { plek: unknown }).plek).toBeNull();
    }
    expect(m.plek).not.toHaveBeenCalled();
  });

  it("geeft plek null als OpenStreetMap niets passends heeft", async () => {
    m.plek.mockResolvedValueOnce(null);
    const res = await vraag("lat=52.1&lng=5.1&naam=Onbekend");
    expect(((await res.json()) as { plek: unknown }).plek).toBeNull();
  });

  it("is IP-begrensd: een te drukke bezoeker krijgt de fout van de begrenzer", async () => {
    m.limiet.mockRejectedValueOnce(Object.assign(new Error("te vaak"), { status: 429 }));
    const res = await vraag("lat=52.1&lng=5.1&naam=Bakker");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(m.plek).not.toHaveBeenCalled();
  });
});
