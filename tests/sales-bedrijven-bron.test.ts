import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SalesCampaign } from "@prisma/client";

// Welke bron zoekt de bedrijven voor een campagne: onze eigen (OpenStreetMap,
// gratis) of het Handelsregister (tegoed per opvraging)? 6 nov liep dat tegoed
// twaalf keer tegen zijn limiet aan terwijl zoeken ook gratis kan.

const RUIM = { tokens: 5000, perMinuut: 300, op: false, at: "2026-11-13T12:00:00.000Z" };
const staat = vi.hoisted(() => ({ sleutel: true, eigen: true, tegoed: null as unknown }));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/integrations/kvkbase", () => ({ isKvkBaseEnabled: () => staat.sleutel }));
// het tegoed bij KVKBase (lib/kvk/tegoed-opslag.ts): de betaalde bron alleen ruim boven de reserve voor de KVK-controles
vi.mock("@/lib/kvk/tegoed-opslag", () => ({ leesKvkTegoed: async () => staat.tegoed }));
vi.mock("@/lib/gratis/keuzes", () => ({
  gebruikEigenVers: async (_id: string, heeftSleutel: boolean) => (heeftSleutel ? staat.eigen : true),
}));

const viaKvk = vi.fn();
const viaOsm = vi.fn();
vi.mock("@/lib/sales/discovery/kvkbase", () => ({ discoverViaKvkBase: (...a: unknown[]) => viaKvk(...a) }));
vi.mock("@/lib/sales/discovery/osm", () => ({ discoverViaOsm: (...a: unknown[]) => viaOsm(...a) }));

import { discoverBedrijven } from "@/lib/sales/discovery/bedrijven";

const campagne = { id: "camp1", targetSectors: ["horeca"], targetCities: ["Utrecht"] } as unknown as SalesCampaign;
const leeg = { created: 0, seen: 0, queries: [], skipped: 0 };
const raak = { created: 3, seen: 9, queries: ["horeca Utrecht"], skipped: 6 };

describe("bron voor het vinden van bedrijven", () => {
  beforeEach(() => {
    staat.sleutel = true;
    staat.eigen = true;
    staat.tegoed = RUIM;
    viaKvk.mockReset().mockResolvedValue(raak);
    viaOsm.mockReset().mockResolvedValue(raak);
  });

  it("gebruikt standaard onze eigen bron en raakt het tegoed niet aan", async () => {
    const uit = await discoverBedrijven(campagne);
    expect(uit.bron).toBe("openstreetmap");
    expect(viaKvk).not.toHaveBeenCalled();
    expect(viaOsm).toHaveBeenCalledOnce();
    expect(uit.created).toBe(3);
  });

  it("op 'betaald' gaat hij naar het Handelsregister", async () => {
    staat.eigen = false;
    const uit = await discoverBedrijven(campagne);
    expect(uit.bron).toBe("kvkbase");
    expect(viaOsm).not.toHaveBeenCalled();
  });

  it("op 'betaald' maar met te weinig tegoed (of onbekend): onze eigen bron, het tegoed blijft voor de KVK-controles", async () => {
    staat.eigen = false;
    for (const tegoed of [null, { ...RUIM, tokens: 40 }, { ...RUIM, op: true, tokens: 0 }]) {
      staat.tegoed = tegoed;
      viaKvk.mockClear();
      const uit = await discoverBedrijven(campagne);
      expect(uit.bron).toBe("openstreetmap");
      expect(viaKvk).not.toHaveBeenCalled();
    }
  });

  it("zonder sleutel is het altijd onze eigen bron", async () => {
    staat.eigen = false;
    staat.sleutel = false;
    const uit = await discoverBedrijven(campagne);
    expect(uit.bron).toBe("openstreetmap");
    expect(viaKvk).not.toHaveBeenCalled();
  });

  it("geeft de betaalde bron niets (tegoed op), dan kijkt hij alsnog bij ons", async () => {
    staat.eigen = false;
    viaKvk.mockResolvedValue(leeg);
    const uit = await discoverBedrijven(campagne);
    expect(uit.bron).toBe("openstreetmap");
    expect(viaKvk).toHaveBeenCalledOnce();
    expect(viaOsm).toHaveBeenCalledOnce();
  });

  it("vond de betaalde bron wél iets, dan blijft het daarbij", async () => {
    staat.eigen = false;
    const uit = await discoverBedrijven(campagne);
    expect(uit.bron).toBe("kvkbase");
    expect(viaOsm).not.toHaveBeenCalled();
  });
});
