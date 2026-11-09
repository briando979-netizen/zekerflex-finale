import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import type { KvkBedrijf } from "@/lib/kvk/types";

const bron = vi.hoisted(() => ({
  indexZoek: vi.fn(),
  indexNummer: vi.fn(),
  onthoud: vi.fn(async () => 0),
  toegestaan: vi.fn(async () => true),
  registerZoek: vi.fn(),
  registerNummer: vi.fn(),
  osmZoek: vi.fn(async () => []),
  adres: vi.fn(async () => null),
}));
const limiet = vi.hoisted(() => ({ enforceRateLimit: vi.fn(async (_spec: { name: string }) => ({ ok: true })) }));

vi.mock("@/lib/rate-limit", () => limiet);
vi.mock("@/lib/kvk/bronnen-echt", () => ({
  echteBronnen: () => ({
    index: { zoek: bron.indexZoek, opNummer: bron.indexNummer, onthoud: bron.onthoud },
    register: { toegestaan: bron.toegestaan, zoek: bron.registerZoek, opNummer: bron.registerNummer },
    osm: { zoek: bron.osmZoek, adresVoor: bron.adres },
    zaai: async () => {},
  }),
}));

const { GET } = await import("@/app/api/company/search/route");
const vraag = (query: string) => GET(new Request(`http://localhost/api/company/search?${query}`));

const acme: KvkBedrijf = {
  kvk: "12345678",
  naam: "Acme B.V.",
  handelsnaam: null,
  rechtsvorm: "Besloten Vennootschap",
  straat: "Oudegracht",
  huisnummer: "1",
  postcode: "3511 AA",
  plaats: "Utrecht",
  btw: null,
  actief: true,
  bron: "kvkbase",
  bijgewerkt: "2026-11-01T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  bron.indexZoek.mockResolvedValue([]);
  bron.indexNummer.mockResolvedValue(null);
  bron.registerZoek.mockResolvedValue([]);
  bron.registerNummer.mockResolvedValue(null);
  bron.toegestaan.mockResolvedValue(true);
});

describe("GET /api/company/search (bedrijf zoeken bij aanmelden)", () => {
  it("geeft treffers uit de eigen index in de bekende vorm", async () => {
    bron.indexZoek.mockResolvedValue([acme]);
    const res = await vraag("q=acme");
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.configured).toBe(true);
    expect(d.results[0]).toMatchObject({ kvkNumber: "12345678", name: "Acme B.V.", city: "Utrecht", source: "register" });
  });

  it("bij een limiet van KVKBase: geen fout, een lege lijst met bezet", async () => {
    bron.registerZoek.mockRejectedValue(new Error("KVKBase rate limit reached, retry shortly"));
    const res = await vraag("q=bakker");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: true, results: [], bezet: true });
  });

  it("een te korte of ontbrekende vraag geeft een lege lijst zonder een bron te raken", async () => {
    expect(await (await vraag("q=ab")).json()).toEqual({ configured: true, results: [] });
    expect(await (await vraag("")).json()).toEqual({ configured: true, results: [] });
    expect(bron.indexZoek).not.toHaveBeenCalled();
  });

  it("?kvk= geeft de gegevens van een bedrijf; een ongeldig nummer een lege lijst", async () => {
    bron.indexNummer.mockResolvedValue(acme);
    const d = await (await vraag("kvk=1234%205678")).json();
    expect(d.results[0]).toMatchObject({ kvkNumber: "12345678", street: "Oudegracht", postalCode: "3511 AA" });
    expect(await (await vraag("kvk=123")).json()).toEqual({ configured: true, results: [] });
  });

  it("OpenStreetMap kost een eigen, strakkere limiet", async () => {
    await vraag("q=bakker&osm=1");
    const namen = limiet.enforceRateLimit.mock.calls.map((c) => c[0].name);
    expect(namen).toEqual(["company-search", "company-osm"]);
    limiet.enforceRateLimit.mockClear();
    await vraag("kvk=12345678");
    expect(limiet.enforceRateLimit.mock.calls.map((c) => c[0].name)).toEqual(["company-search", "company-details"]);
  });

  it("past de limiet toe: 429 en geen bron geraakt", async () => {
    limiet.enforceRateLimit.mockRejectedValueOnce(AppError.rateLimited("Te veel zoekopdrachten", 60, 30));
    const res = await vraag("q=bakker");
    expect(res.status).toBe(429);
    expect(bron.indexZoek).not.toHaveBeenCalled();
  });
});
