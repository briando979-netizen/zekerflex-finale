import { beforeEach, describe, expect, it, vi } from "vitest";

// G6 (22 nov 2026, privé-accounts van de eigenaar): de openbare kaart "open diensten" (/open-diensten en de 3D-variant) telt en
// toont geen testklussen en geen klussen van een eigen-testbedrijf (lib/admin/eigen-test-regel.ts).

const h = vi.hoisted(() => ({
  et: { tenants: {} as Record<string, string>, users: {} as Record<string, string> },
  rows: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/admin/eigen-test", () => ({ leesEigenTest: async () => h.et }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined }));
vi.mock("@/lib/prisma", () => ({ prisma: { shift: { findMany: async () => h.rows } } }));

import { getOpenShiftMap } from "@/lib/shifts/open-map";

const sinds = "2026-11-13T12:00:00.000Z";

function klus(title: string, tenantId: string, bedrijf: string, city: string, createdAt = "2026-11-14T10:00:00.000Z") {
  return { title, createdAt: new Date(createdAt), hourlyRateCents: 1650, branch: { city, latitude: 52.37, longitude: 4.9, tenantId, tenant: { name: bedrijf } } };
}

beforeEach(() => {
  h.et = { tenants: { t_prive: sinds }, users: {} };
  h.rows = [
    klus("Afwasser", "t_echt", "Bakkerij Jansen", "Amsterdam"),
    klus("Bediening", "t_prive", "Mijn bedrijf", "Amsterdam"),
    klus("Kassa", "t_prive", "Mijn bedrijf", "Utrecht", "2026-11-01T10:00:00.000Z"),
    klus("Orderpicker", "t_test", "Test bedrijven", "Rotterdam"),
    klus("Testklus magazijn", "t_echt", "Bakkerij Jansen", "Rotterdam"),
  ];
});

describe("de kaart met open diensten", () => {
  it("telt alleen echt werk: geen klus van een eigen-testbedrijf (ook van vóór de markering) en geen testklus", async () => {
    const kaart = await getOpenShiftMap();
    expect(kaart.totalShifts).toBe(1);
    expect(kaart.totalCities).toBe(1);
    expect(kaart.cities.map((c) => [c.city, c.count, c.sampleTitles])).toEqual([["Amsterdam", 1, ["Afwasser"]]]);
  });

  it("zonder markeringen vallen alleen de testklussen op naam weg", async () => {
    h.et = { tenants: {}, users: {} };
    const kaart = await getOpenShiftMap();
    expect(kaart.totalShifts).toBe(3);
    expect(kaart.cities.map((c) => c.city).sort()).toEqual(["Amsterdam", "Utrecht"]);
  });
});
