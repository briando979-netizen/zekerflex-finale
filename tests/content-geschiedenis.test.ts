import { beforeEach, describe, expect, it, vi } from "vitest";

const opslag = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => opslag.get(k) ?? null),
  kvSet: vi.fn(async (k: string, v: unknown) => {
    opslag.set(k, v);
  }),
}));

import { bewaarTekstWijziging, tekstGeschiedenis } from "@/lib/content/geschiedenis";

describe("geschiedenis van de sitetekst", () => {
  beforeEach(() => opslag.clear());

  it("legt oud en nieuw vast, nieuwste eerst; ongewijzigd telt niet", async () => {
    await bewaarTekstWijziging("hero.titleLine1", "Zeker van je werk.", "Werk dat zeker is.");
    await bewaarTekstWijziging("hero.titleLine1", "Werk dat zeker is.", "Werk dat zeker is.");
    await bewaarTekstWijziging("cta.title", "Klaar?", "Begin nu");
    const g = await tekstGeschiedenis();
    expect(g.map((w) => [w.key, w.oud, w.nieuw])).toEqual([
      ["cta.title", "Klaar?", "Begin nu"],
      ["hero.titleLine1", "Zeker van je werk.", "Werk dat zeker is."],
    ]);
    expect(g[0]?.op).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("bewaart hooguit de laatste 200 wijzigingen", async () => {
    for (let i = 0; i < 205; i++) await bewaarTekstWijziging("faq.title", `v${i}`, `v${i + 1}`);
    const g = await tekstGeschiedenis();
    expect(g.length).toBe(200);
    expect(g[0]?.nieuw).toBe("v205");
  });
});
