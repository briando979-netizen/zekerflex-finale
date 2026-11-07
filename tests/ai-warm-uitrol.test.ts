import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/kv", () => ({ kvGet: vi.fn(), kvSet: vi.fn(), kvDelete: vi.fn() }));

import { uitrolHoudtModelStil } from "@/lib/bouwer/live";

// Tijdens een uitrol staat het eigen AI-model bewust stil (deploy/scripts/vps-update.sh);
// een mislukte opwarmtik is dan geen storing (7 nov: vier onterechte meldingen).
const NU = Date.parse("2026-11-07T18:00:00.000Z");
const geleden = (min: number) => new Date(NU - min * 60_000).toISOString();

describe("opwarmen van het AI-model tijdens een uitrol", () => {
  it("een lopende uitrol houdt het model stil", () => {
    expect(uitrolHoudtModelStil({ staat: "bezig", bijgewerkt: geleden(3) }, NU)).toBe(true);
  });

  it("net na de uitrol laadt het model nog, daarna telt een fout weer", () => {
    expect(uitrolHoudtModelStil({ staat: "klaar", bijgewerkt: geleden(5) }, NU)).toBe(true);
    expect(uitrolHoudtModelStil({ staat: "klaar", bijgewerkt: geleden(15) }, NU)).toBe(false);
  });

  it("een uitrol die al lang 'bezig' zegt (vastgelopen) dekt geen echte storing af", () => {
    expect(uitrolHoudtModelStil({ staat: "bezig", bijgewerkt: geleden(60) }, NU)).toBe(false);
  });

  it("zonder uitrolstand gewoon een storing", () => {
    expect(uitrolHoudtModelStil(null, NU)).toBe(false);
    expect(uitrolHoudtModelStil({ staat: "bezig", bijgewerkt: "kapot" }, NU)).toBe(false);
  });
});
