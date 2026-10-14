import { afterEach, describe, expect, it, vi } from "vitest";

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (key: string) => kv.get(key) ?? null),
  kvSet: vi.fn(async (key: string, value: unknown) => {
    kv.set(key, value);
  }),
  kvDelete: vi.fn(async (key: string) => {
    kv.delete(key);
  }),
  kvListValues: vi.fn(async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v)),
}));

import { saveAd, listAds, getAd, deleteAd } from "@/lib/ads/store";

afterEach(() => {
  kv.clear();
  vi.clearAllMocks();
});

const BASE = {
  audience: "freelancer" as const,
  angle: null,
  headline: "H",
  subheadline: "S",
  body: "B",
  cta: "C",
  imageB64: null,
  imageMimeType: null,
  imagePrompt: null,
  createdById: "u1",
};

describe("ads store", () => {
  it("saves an ad with a generated id and timestamp", async () => {
    const ad = await saveAd(BASE);
    expect(ad.id).toBeTruthy();
    expect(ad.createdAt).toBeTruthy();
    expect(ad.headline).toBe("H");
  });

  it("lists ads newest first", async () => {
    const a = await saveAd({ ...BASE, headline: "First" });
    await new Promise((r) => setTimeout(r, 2));
    const b = await saveAd({ ...BASE, headline: "Second" });
    const all = await listAds();
    expect(all.map((x) => x.id)).toEqual([b.id, a.id]);
  });

  it("gets a single ad by id", async () => {
    const ad = await saveAd(BASE);
    expect((await getAd(ad.id))?.headline).toBe("H");
    expect(await getAd("nonexistent")).toBeNull();
  });

  it("deletes an ad", async () => {
    const ad = await saveAd(BASE);
    await deleteAd(ad.id);
    expect(await getAd(ad.id)).toBeNull();
  });
});
