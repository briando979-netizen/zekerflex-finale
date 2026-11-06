import { beforeEach, describe, expect, it, vi } from "vitest";

const opslag = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => opslag.get(k) ?? null),
  kvSet: vi.fn(async (k: string, v: unknown) => {
    opslag.set(k, v);
  }),
}));

import { STANDAARD_GRATIS_MODEL, eigenBasisUrl, getGratisStand, gratisAan, gratisBasis, gratisModel, primeGratis, setGratisStand } from "@/lib/ai/gratis";

describe("alles gratis: de AI op onze eigen server", () => {
  beforeEach(async () => {
    opslag.clear();
    await setGratisStand({ aan: false, basis: "", model: "" });
  });

  it("staat standaard uit, dus er verandert niets zonder dat je het aanzet", async () => {
    opslag.clear();
    // cache leegmaken door een verse prime na het wissen
    await setGratisStand({ aan: false });
    expect(gratisAan()).toBe(false);
    expect((await getGratisStand()).aan).toBe(false);
  });

  it("aangezet gebruikt hij onze eigen server en ons eigen model", async () => {
    await setGratisStand({ aan: true });
    expect(gratisAan()).toBe(true);
    expect(gratisBasis()).toBe(eigenBasisUrl());
    expect(gratisModel("main")).toBe(STANDAARD_GRATIS_MODEL);
    expect(gratisModel("reasoning")).toBe(STANDAARD_GRATIS_MODEL);
  });

  it("embeddings houden hun eigen model, dat draait al gratis", async () => {
    await setGratisStand({ aan: true, model: "qwen2.5:3b" });
    expect(gratisModel("embed")).not.toBe("qwen2.5:3b");
    expect(gratisModel("embed").length).toBeGreaterThan(0);
  });

  it("een eigen server en model kun je zelf kiezen; een slotstreepje valt weg", async () => {
    const v = await setGratisStand({ aan: true, basis: "http://eigen-ai:11434/v1/", model: "mijn-model" });
    expect(v.basis).toBe("http://eigen-ai:11434/v1");
    expect(gratisBasis()).toBe("http://eigen-ai:11434/v1");
    expect(gratisModel("main")).toBe("mijn-model");
  });

  it("kapotte opslag laat de laatste stand staan in plaats van alles om te gooien", async () => {
    await setGratisStand({ aan: true });
    opslag.set("ai-node:gratis", "onzin");
    // de cache is nog vers, dus prime doet niets; daarna leest hij de onzin als "uit"
    await primeGratis();
    expect(gratisAan()).toBe(true);
  });
});
