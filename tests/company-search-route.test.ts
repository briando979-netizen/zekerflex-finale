import { beforeEach, describe, expect, it, vi } from "vitest";

const kvk = vi.hoisted(() => ({ autocompleteCompanies: vi.fn(), searchCompanies: vi.fn() }));
const geheugen = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/integrations/kvkbase", () => ({ ...kvk, isKvkBaseEnabled: () => true }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/redis", () => ({
  // zoals lib/redis cached(): alleen een geslaagde uitkomst wordt onthouden
  cached: async (key: string, _ttl: number, produce: () => Promise<unknown>) => {
    if (geheugen.has(key)) return geheugen.get(key);
    const v = await produce();
    geheugen.set(key, v);
    return v;
  },
}));

const { GET } = await import("@/app/api/company/search/route");
const zoek = (q: string) => GET(new Request(`http://localhost/api/company/search?q=${encodeURIComponent(q)}`));

beforeEach(() => {
  vi.clearAllMocks();
  geheugen.clear();
});

describe("GET /api/company/search (KVK zoeken bij aanmelden)", () => {
  it("onthoudt dezelfde zoekvraag: de KVK-dienst wordt maar één keer gevraagd", async () => {
    kvk.autocompleteCompanies.mockResolvedValue([{ kvkNumber: "12345678", name: "Bakkerij Jansen", city: "Utrecht" }]);
    const eerst = await (await zoek("Bakkerij Jansen")).json();
    const daarna = await (await zoek("bakkerij jansen")).json();
    expect(eerst).toEqual({ configured: true, results: [{ kvkNumber: "12345678", name: "Bakkerij Jansen", city: "Utrecht" }] });
    expect(daarna).toEqual(eerst);
    expect(kvk.autocompleteCompanies).toHaveBeenCalledTimes(1);
  });

  it("bij een limiet van de KVK-dienst: geen tweede vraag en geen fout, het formulier vult zelf in", async () => {
    kvk.autocompleteCompanies.mockRejectedValue(new Error("KVKBase rate limit reached, retry shortly"));
    const res = await zoek("Bakker");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: true, results: [], bezet: true });
    expect(kvk.searchCompanies).not.toHaveBeenCalled();
    // een mislukte vraag wordt niet onthouden
    kvk.autocompleteCompanies.mockResolvedValue([]);
    expect(await (await zoek("Bakker")).json()).toEqual({ configured: true, results: [] });
  });

  it("valt bij een andere fout terug op het gewone zoeken", async () => {
    kvk.autocompleteCompanies.mockRejectedValue(new Error("onbekend antwoord"));
    kvk.searchCompanies.mockResolvedValue([{ kvkNumber: "87654321", legalName: "Jansen B.V.", city: "Gouda" }]);
    expect(await (await zoek("Jansen")).json()).toEqual({ configured: true, results: [{ kvkNumber: "87654321", name: "Jansen B.V.", city: "Gouda" }] });
  });
});
