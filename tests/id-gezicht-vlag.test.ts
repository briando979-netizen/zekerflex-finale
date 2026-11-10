import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined }));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => undefined, info: () => undefined, error: () => undefined } }));

import { FLAG_REGISTRY, featureEnabled } from "@/lib/flags";
import { MODELLEN } from "@/lib/kyc/gezicht/motor";

// Automatisch goedkeuren op het gezicht staat standaard UIT (11 nov): de drempel is nog niet gemeten op echte
// pasfoto's en de selfie wordt nog niet op echtheid gecontroleerd. De eigenaar zet hem aan na een meting.
describe("vlag id-gezicht-automatisch", () => {
  it("staat in het register en is standaard uit", async () => {
    const vlag = FLAG_REGISTRY.find((f) => f.key === "id-gezicht-automatisch");
    expect(vlag?.default).toBe(false);
    expect(vlag?.description).toMatch(/Standaard uit/);
    expect(await featureEnabled("id-gezicht-automatisch")).toBe(false);
  });
});

describe("gezichtsmodellen", () => {
  it("hebben een vaste hash en grootte, en komen van OpenCV Zoo", () => {
    for (const m of Object.values(MODELLEN)) {
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.bytes).toBeGreaterThan(100_000);
      expect(m.url).toMatch(/^https:\/\/github\.com\/opencv\/opencv_zoo\/raw\/main\/models\//);
      expect(m.url.endsWith(m.bestand)).toBe(true);
    }
  });
});
