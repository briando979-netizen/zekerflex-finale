import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  zaken: [] as { id: string; slug: string; naam: string; soort: string; adres: string; plaats: string }[],
  zoek: vi.fn(),
  vragen: 0,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    horecaZaak: {
      findMany: async () => {
        m.vragen += 1;
        return m.zaken;
      },
    },
  },
}));
vi.mock("@/lib/geo/pdok", () => ({ zoekCoordinaat: m.zoek }));
vi.mock("@/lib/storage/kv", () => ({ kvListEntries: async () => [], kvGet: async () => null, kvSet: async () => undefined }));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => undefined, info: () => undefined, error: () => undefined } }));

import { horecaSoortNl, osmSoortNl, plaatsenGeoJson, veiligeLink, type Plaats } from "@/lib/kaart/plaatsen";
import { zekerFlexPlaatsen } from "@/lib/kaart/plaatsen-server";

beforeEach(() => {
  m.zaken = [];
  m.vragen = 0;
  m.zoek.mockReset();
  (globalThis as unknown as { __zfKaartPlaatsen?: unknown }).__zfKaartPlaatsen = undefined;
});

describe("soorten in gewoon Nederlands", () => {
  it("kent de horecasoorten en valt terug op Horeca, ook voor een sleutel uit de URL", () => {
    expect(horecaSoortNl("cafe")).toBe("Café");
    expect(horecaSoortNl("restaurant")).toBe("Restaurant");
    expect(horecaSoortNl("onbekend")).toBe("Horeca");
    expect(horecaSoortNl("constructor")).toBe("Horeca");
  });

  it("vertaalt plekken uit de kaartgegevens en maakt van een onbekende soort leesbare tekst", () => {
    expect(osmSoortNl("fast_food")).toBe("Snackbar");
    expect(osmSoortNl("pharmacy")).toBe("Apotheek");
    expect(osmSoortNl("bike_shop")).toBe("Bike shop");
    expect(osmSoortNl(undefined)).toBe("Plek");
    expect(osmSoortNl("constructor")).toBe("Constructor");
  });
});

describe("veiligeLink", () => {
  it("laat alleen onze eigen horecasites door", () => {
    expect(veiligeLink("/horeca/cafe-de-dam")).toBe("/horeca/cafe-de-dam");
    for (const slecht of ["https://evil.nl", "javascript:alert(1)", "/horeca/../admin", "//evil.nl", "/admin", "/horeca/", "", 5, null, "/horeca/a b"]) {
      expect(veiligeLink(slecht), String(slecht)).toBe("");
    }
  });
});

describe("plaatsenGeoJson", () => {
  const p = (delta: Partial<Plaats> = {}): Plaats => ({ id: "1", naam: "Café De Dam", soort: "Café", adres: "Dam 1", plaats: "Amsterdam", lat: 52.37, lon: 4.89, link: "/horeca/cafe-de-dam", ...delta });

  it("zet lengte en breedte in de goede volgorde en laat onmogelijke plekken weg", () => {
    const g = plaatsenGeoJson([p(), p({ id: "2", lat: NaN }), p({ id: "3", lat: 95 })]);
    expect(g.features).toHaveLength(1);
    expect(g.features[0]?.geometry.coordinates).toEqual([4.89, 52.37]);
    expect(g.features[0]?.properties.naam).toBe("Café De Dam");
  });
});

describe("zekerFlexPlaatsen", () => {
  it("geeft alleen zaken met een gevonden adres, met de link naar de eigen site en zonder contactgegevens", async () => {
    m.zaken = [
      { id: "a", slug: "cafe-de-dam", naam: "Café De Dam", soort: "cafe", adres: "Dam 1", plaats: "Amsterdam" },
      { id: "b", slug: "zonder-adres", naam: "Zonder adres", soort: "bar", adres: "", plaats: "" },
      { id: "c", slug: "onvindbaar", naam: "Onvindbaar", soort: "bar", adres: "Nergens 9", plaats: "Niets" },
    ];
    m.zoek.mockImplementation(async (t: string) => (t.startsWith("Dam 1") ? { lat: 52.37, lon: 4.89, naam: "Dam 1", soort: "adres", postcode: null, plaats: "Amsterdam", straat: "Dam" } : null));
    const r = await zekerFlexPlaatsen();
    expect(r).toEqual([{ id: "a", naam: "Café De Dam", soort: "Café", adres: "Dam 1", plaats: "Amsterdam", lat: 52.37, lon: 4.89, link: "/horeca/cafe-de-dam" }]);
    expect(JSON.stringify(r)).not.toMatch(/telefoon|email|kvk/i);
  });

  it("bewaart het antwoord tien minuten en vraagt daarna opnieuw", async () => {
    m.zaken = [{ id: "a", slug: "x", naam: "X", soort: "bar", adres: "Dam 1", plaats: "Amsterdam" }];
    m.zoek.mockResolvedValue({ lat: 52, lon: 5, naam: "x", soort: "adres", postcode: null, plaats: null, straat: null });
    const nu = Date.parse("2026-11-11T10:00:00+01:00");
    await zekerFlexPlaatsen(nu);
    await zekerFlexPlaatsen(nu + 5 * 60_000);
    expect(m.vragen).toBe(1);
    await zekerFlexPlaatsen(nu + 11 * 60_000);
    expect(m.vragen).toBe(2);
  });

  it("laat één mislukt adres de rest niet meenemen", async () => {
    m.zaken = [
      { id: "a", slug: "a", naam: "A", soort: "bar", adres: "Goed 1", plaats: "Plaats" },
      { id: "b", slug: "b", naam: "B", soort: "bar", adres: "Stuk 2", plaats: "Plaats" },
    ];
    m.zoek.mockImplementation(async (t: string) => {
      if (t.startsWith("Stuk")) throw new Error("PDOK weg");
      return { lat: 52, lon: 5, naam: t, soort: "adres", postcode: null, plaats: null, straat: null };
    });
    expect((await zekerFlexPlaatsen()).map((x) => x.id)).toEqual(["a"]);
  });
});
