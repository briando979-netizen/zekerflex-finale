import { beforeEach, describe, expect, it, vi } from "vitest";

const opslag = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => opslag.get(k) ?? null),
  kvSet: vi.fn(async (k: string, v: unknown) => {
    opslag.set(k, v);
  }),
}));

let gratisStaatAan = false;
vi.mock("@/lib/ai/gratis", () => ({
  gratisAan: () => gratisStaatAan,
  primeGratis: async () => undefined,
}));

import { STANDAARD_KEUZE } from "@/lib/gratis/keuze-soorten";
import {
  betaaldeTerugvalMag,
  gebruikEigen,
  gebruikEigenVers,
  getKeuzes,
  keuzeVoor,
  setKeuze,
} from "@/lib/gratis/keuzes";

describe("per dienst kiezen welke bron hij pakt", () => {
  beforeEach(async () => {
    opslag.clear();
    gratisStaatAan = false;
    // cache verversen naar de standaard
    for (const [id, bron] of Object.entries(STANDAARD_KEUZE)) {
      await setKeuze(id as keyof typeof STANDAARD_KEUZE, bron);
    }
  });

  it("begint op de standaard: zelf rekenen, zelf zoeken, review-scan nog bij Google", async () => {
    const k = await getKeuzes();
    expect(k.reistijd).toBe("eigen");
    expect(k["sales-bedrijven"]).toBe("eigen");
    expect(k["review-bedrijven"]).toBe("betaald");
    expect(k.stem).toBe("auto");
  });

  it("'eigen' gebruikt onze eigen bron, ook al staat er een sleutel", () => {
    expect(gebruikEigen("reistijd", true)).toBe(true);
    expect(betaaldeTerugvalMag("reistijd", true)).toBe(false);
  });

  it("'betaald' gaat naar de betaalde dienst, met onze bron als terugval", () => {
    expect(gebruikEigen("review-bedrijven", true)).toBe(false);
    expect(betaaldeTerugvalMag("review-bedrijven", true)).toBe(true);
  });

  it("zonder sleutel is het altijd onze eigen bron", () => {
    expect(gebruikEigen("review-bedrijven", false)).toBe(true);
    expect(betaaldeTerugvalMag("review-bedrijven", false)).toBe(false);
  });

  it("'automatisch' volgt de grote knop", async () => {
    expect(gebruikEigen("stem", true)).toBe(false);
    gratisStaatAan = true;
    expect(gebruikEigen("stem", true)).toBe(true);
  });

  it("een gewijzigde keuze blijft staan en geldt meteen", async () => {
    await setKeuze("review-bedrijven", "eigen");
    expect(keuzeVoor("review-bedrijven")).toBe("eigen");
    expect(await gebruikEigenVers("review-bedrijven", true)).toBe(true);
  });

  it("onzin in de opslag valt terug op de standaard", async () => {
    await setKeuze("reistijd", "betaald");
    expect(keuzeVoor("reistijd")).toBe("betaald");
    // schrijf rommel en forceer een verse lezing via een nieuwe waarde
    opslag.set("gratis:keuzes", { reistijd: "onzin", stem: 42 });
    await setKeuze("stem", "eigen"); // leest eerst (cache nog vers), schrijft daarna
    const k = await getKeuzes();
    expect(["eigen", "betaald", "auto"]).toContain(k.reistijd);
    expect(k.stem).toBe("eigen");
  });
});
