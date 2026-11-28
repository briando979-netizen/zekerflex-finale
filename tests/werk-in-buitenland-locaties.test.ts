import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// POST en PATCH /api/werkgever/branches met een werklocatie buiten Nederland (vlag `werk-in-belgie` voor België, alleen
// Vlaanderen; `werk-in-buitenland` voor elk land; beide standaard uit). Dezelfde controle bij toevoegen en bewerken
// (lib/geo/vestiging-buitenland.ts → controleerWerklocatiePostcode). Een Nederlandse locatie gaat zoals altijd.

const m = vi.hoisted(() => ({
  featureEnabled: vi.fn(),
  branchCreate: vi.fn(),
  branchUpdate: vi.fn(),
  branchFindFirst: vi.fn(),
}));

vi.mock("@/lib/flags", () => ({ featureEnabled: (...a: unknown[]) => m.featureEnabled(...a) }));
vi.mock("@/lib/auth", () => ({
  requirePrincipal: async () => ({ userId: "u1", email: "baas@bedrijf.test", memberships: [{ tenantId: "t1", role: "HQ_ADMIN" }] }),
  requireRole: () => undefined,
}));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["t1"], branchIds: null }) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    branch: {
      create: (...a: unknown[]) => m.branchCreate(...a),
      update: (...a: unknown[]) => m.branchUpdate(...a),
      findFirst: (...a: unknown[]) => m.branchFindFirst(...a),
    },
  },
}));

import { POST } from "@/app/api/werkgever/branches/route";
import { PATCH } from "@/app/api/werkgever/branches/[id]/route";
import { WERK_IN_BELGIE_VLAG, WERK_IN_BUITENLAND_VLAG } from "@/lib/geo/vestiging-land";

const vlaggen = (aan: { belgie?: boolean; buitenland?: boolean }) =>
  m.featureEnabled.mockImplementation(async (key: string) => (key === WERK_IN_BELGIE_VLAG ? aan.belgie === true : key === WERK_IN_BUITENLAND_VLAG ? aan.buitenland === true : false));
const lichaam = (postalCode: string) => ({ name: "Locatie", addressLine: "Straat 1", postalCode, city: "Plaats", latitude: 51.2, longitude: 4.4 });
const post = (body: unknown) => POST(new Request("https://app.example/api/werkgever/branches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const patch = (body: unknown) =>
  PATCH(new Request("https://app.example/api/werkgever/branches/b1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "b1" }),
  });

beforeEach(() => {
  vlaggen({});
  m.branchCreate.mockResolvedValue({ id: "b1", name: "Locatie" });
  m.branchUpdate.mockResolvedValue({ id: "b1", name: "Locatie" });
  m.branchFindFirst.mockResolvedValue({ id: "b1", name: "Locatie" });
});
afterEach(() => vi.clearAllMocks());

describe("een locatie toevoegen (POST)", () => {
  it("Nederland zoals altijd, zonder naar de vlaggen te kijken", async () => {
    expect((await post(lichaam("3012AA"))).status).toBe(201);
    expect(m.branchCreate.mock.calls[0]?.[0].data.postalCode).toBe("3012AA");
    const kort = await post(lichaam("301"));
    expect(kort.status).toBe(422);
    expect((await kort.json()).error.message).toBe("Controleer de ingevulde gegevens");
    expect(m.featureEnabled).not.toHaveBeenCalled();
  });

  it("beide vlaggen uit: geen locatie buiten Nederland", async () => {
    const res = await post(lichaam("BE-2000"));
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toBe("Werklocaties in dit land staan nog niet aan.");
    expect(m.branchCreate).not.toHaveBeenCalled();
  });

  it("alleen werk-in-belgie: Vlaanderen wel, Brussel en Duitsland niet", async () => {
    vlaggen({ belgie: true });
    expect((await post(lichaam("BE-2000"))).status).toBe(201);
    expect(m.branchCreate.mock.calls[0]?.[0].data.postalCode).toBe("BE-2000");
    const brussel = await post(lichaam("BE-1000"));
    expect(brussel.status).toBe(422);
    expect((await brussel.json()).error.message).toBe("Brussel en Wallonië volgen later; nu kan een werklocatie in België alleen in Vlaanderen.");
    expect((await post(lichaam("DE-10115"))).status).toBe(422);
    expect(m.branchCreate).toHaveBeenCalledTimes(1);
  });

  it("alle landen aan: elk land, ook zonder postcode waar die niet bestaat", async () => {
    vlaggen({ buitenland: true });
    expect((await post(lichaam("DE-10115"))).status).toBe(201);
    expect((await post(lichaam("AE-"))).status).toBe(201);
    expect((await post(lichaam("DE-"))).status).toBe(422);
    expect(m.branchCreate.mock.calls.map((c) => c[0].data.postalCode)).toEqual(["DE-10115", "AE-"]);
  });

  it("een land met sancties nooit, ook met alle landen aan", async () => {
    vlaggen({ belgie: true, buitenland: true });
    for (const c of ["CU", "IR", "KP", "SY", "RU", "BY"]) {
      const res = await post(lichaam(`${c}-101000`));
      expect(res.status, c).toBe(422);
      expect((await res.json()).error.message, c).toBe("Werken in dit land kan niet via ZekerFlex.");
    }
    expect(m.branchCreate).not.toHaveBeenCalled();
  });
});

describe("een locatie bewerken (PATCH): dezelfde controle", () => {
  it("Nederland zoals altijd; buiten Nederland alleen wat de vlaggen toestaan", async () => {
    expect((await patch({ postalCode: "3012AA" })).status).toBe(200);
    expect(m.branchUpdate.mock.calls[0]?.[0].data).toEqual({ postalCode: "3012AA" });
    expect((await patch({ postalCode: "BE-2000" })).status).toBe(422);
    vlaggen({ belgie: true });
    expect((await patch({ postalCode: "be-2000" })).status).toBe(200);
    expect(m.branchUpdate.mock.calls[1]?.[0].data).toEqual({ postalCode: "BE-2000" });
    expect((await patch({ postalCode: "BE-5000" })).status).toBe(422);
    vlaggen({ buitenland: true });
    const ru = await patch({ postalCode: "RU-101000" });
    expect(ru.status).toBe(422);
    expect((await ru.json()).error.message).toBe("Werken in dit land kan niet via ZekerFlex.");
    // zonder postcode in het verzoek: geen controle, geen vlaggen
    m.featureEnabled.mockClear();
    expect((await patch({ name: "Nieuwe naam" })).status).toBe(200);
    expect(m.featureEnabled).not.toHaveBeenCalled();
  });
});
